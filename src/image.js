// Compression des photos d'article, dans le navigateur, avant tout envoi.
//
// Ces photos servent à reconnaître un article dans une liste — « c'est bien
// cette coupette-là » — pas à l'admirer. Une vignette floue de 15 Ko répond à
// la question ; une photo de téléphone de 4 Mo y répond aussi, mais coûte
// 250 fois plus de stockage et se charge 250 fois plus lentement sur le
// réseau d'un dépôt.
//
// D'où des réglages volontairement bas. Si le résultat te semble trop flou,
// monte COTE_MAX avant QUALITE : la taille d'affichage se voit, la
// compression JPEG beaucoup moins.

const COTE_MAX = 400;   // pixels sur le plus grand côté
const QUALITE = 0.5;    // 0 à 1
const TAILLE_VISEE = 512000; // le plafond du bucket, en octets

// WebP compresse mieux que JPEG à qualité égale, et tous les navigateurs
// actuels savent l'encoder. Le repli existe pour les vieux Safari.
const formatSupporte = () => {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp')
      ? 'image/webp' : 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
};

// DEUX DÉCODEURS, ET L'ORDRE COMPTE.
//
// `createImageBitmap` lit des formats que `<img>` refuse — le HEIC des
// iPhone au premier chef. C'est le format de TOUTE photo prise par un
// iPhone, donc de tout ce qui sort de la photothèque ; une photo prise à
// l'instant depuis le navigateur, elle, arrive en JPEG. D'où un bug qui ne
// se manifestait que sur la moitié des chemins, et dont la cause n'avait
// rien à voir avec la moitié en question.
//
// `<img>` reste en second : plus ancien, plus permissif sur les fichiers
// légèrement malformés, et présent partout.
const chargerImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Format refusé par ce décodeur-ci — on tente l'autre.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
};

const versBlob = (canvas, type, qualite) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression impossible'))),
      type,
      qualite,
    );
  });

const tropLourd = (file) =>
  `Cette image n'a pas pu être lue par le navigateur et pèse `
  + `${poidsLisible(file.size)}, au-delà de la limite de `
  + `${poidsLisible(TAILLE_VISEE)}. C'est le cas des photos HEIC de la `
  + `photothèque iPhone sur certains navigateurs. Prends-la avec l'appareil `
  + `photo, ou exporte-la en JPEG.`;

/**
 * Réduit et compresse une image. Rend un File prêt à téléverser.
 *
 * SUR ÉCHEC, ON REND L'ORIGINAL — MAIS SEULEMENT S'IL PASSE LE PLAFOND.
 *
 * La première version rendait l'original quoi qu'il arrive, au motif que
 * « mieux vaut une photo lourde que pas de photo, le plafond du bucket
 * tranchera ». Le plafond tranche en effet, et voici comment, mesuré sur un
 * fichier de 3,1 Mo : trente-six secondes d'envoi, puis 413. Vu du
 * téléphone : ça charge longtemps, et rien ne se passe.
 *
 * Le choix n'était donc pas « photo lourde ou pas de photo » — une photo
 * trop lourde n'est jamais envoyée. Il était entre un message clair tout de
 * suite et un échec incompréhensible après une minute d'attente.
 */
export const compresserImage = async (file, options = {}) => {
  const coteMax = options.coteMax ?? COTE_MAX;
  const qualite = options.qualite ?? QUALITE;

  if (!file) return file;

  // UN TYPE ABSENT N'EST PAS UN TYPE NON-IMAGE, et cette porte-là court-
  // circuitait le contrôle de taille. Beaucoup de sélecteurs mobiles rendent
  // un `type` vide : le fichier ressortait intact, 3 Mo compris, et repartait
  // droit vers le 413 que tout le reste de cette fonction sert à éviter.
  //
  // Sans type, on tente le décodage. Un vrai non-image (un PDF glissé dans le
  // champ) sort ici, mais passe par le même contrôle de taille.
  if (file.type && !file.type.startsWith('image/')) {
    if (file.size <= TAILLE_VISEE) return file;
    throw new Error(tropLourd(file));
  }

  try {
    const img = await chargerImage(file);

    const facteur = Math.min(1, coteMax / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * facteur));
    canvas.height = Math.max(1, Math.round(img.height * facteur));

    const ctx = canvas.getContext('2d');
    // Un aplat blanc d'abord : sans lui, une PNG transparente vire au noir
    // une fois encodée en JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const type = formatSupporte();
    let blob = await versBlob(canvas, type, qualite);

    // Filet : une image très bruitée peut rester lourde malgré tout. On
    // redescend la qualité plutôt que de laisser le bucket refuser l'envoi.
    let essai = qualite;
    while (blob.size > TAILLE_VISEE && essai > 0.2) {
      essai -= 0.15;
      blob = await versBlob(canvas, type, essai);
    }

    // Déjà plus léger à l'origine : inutile de le réencoder.
    if (blob.size >= file.size && file.size <= TAILLE_VISEE) return file;

    const extension = type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `photo.${extension}`, { type });
  } catch {
    // Illisible, mais assez léger pour passer : on tente tel quel. Le serveur
    // saura peut-être en faire quelque chose, et l'aperçu échouera au pire.
    if (file.size <= TAILLE_VISEE) return file;

    throw new Error(tropLourd(file));
  }
};

export const poidsLisible = (octets) =>
  octets >= 1024 * 1024
    ? `${(octets / 1024 / 1024).toFixed(1)} Mo`
    : `${Math.round(octets / 1024)} Ko`;
