// Demo listings. floorPrice is the seller's secret lowest price.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'img');
const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP'];

// Real photos win over the drawn placeholders. Drop a photo named after the item
// (e.g. "peshawari.jpg") into public/img/ or the main project folder.
const PHOTO_NAMES = {
  lst_chappal: ['peshawari', 'chappal', 'sandal', 'sandals'],
  lst_headphones: ['headphones', 'headphone'],
  lst_camera: ['vintage', 'camera', 'vintage camera'],
  lst_ajrak: ['ajrak', 'shawl'],
};

function findPhoto(listingId) {
  for (const name of PHOTO_NAMES[listingId] || []) {
    for (const ext of PHOTO_EXT) {
      const inImg = path.join(IMG_DIR, name + ext);
      if (fs.existsSync(inImg)) return `/img/${name}${ext}`;
      const inRoot = path.join(ROOT, name + ext);
      if (fs.existsSync(inRoot)) {
        fs.copyFileSync(inRoot, inImg); // make it servable
        return `/img/${name}${ext}`;
      }
    }
  }
  return null;
}

function withPhotos(list) {
  return list.map((l) => ({ ...l, image: findPhoto(l.id) || l.image }));
}

function listings() {
  return withPhotos(baseListings());
}

function baseListings() {
  const now = new Date().toISOString();
  return [
    {
      id: 'lst_headphones',
      createdAt: now,
      title: 'Wireless noise-cancelling headphones',
      description:
        'Over-ear Bluetooth headphones, matte black with soft cushioned ear cups, with active noise cancelling. About 30 hours of battery. Used for 6 months, no scratches.',
      condition: 'Used, like new',
      askingPrice: 120,
      floorPrice: 85,
      sellerName: 'Hamza Electronics',
      sellerStyle: 'friendly but firm',
      location: 'Lahore',
      image: '/img/headphones.svg',
    },
    {
      id: 'lst_ajrak',
      createdAt: now,
      title: 'Hand-block-printed Ajrak shawl',
      description:
        'Traditional Sindhi ajrak shawl in deep maroon with white and black geometric and floral block-print patterns and a decorated border. Cotton, about 2.5 metres long. New.',
      condition: 'New',
      askingPrice: 45,
      floorPrice: 32,
      sellerName: 'Hala Crafts',
      sellerStyle: 'warm, proud of the craft, tells stories about the artisans',
      location: 'Hala, Sindh',
      image: '/img/ajrak.svg',
    },
    {
      id: 'lst_camera',
      createdAt: now,
      title: 'Vintage 35mm compact film camera',
      description:
        'Champagne-silver 35mm compact point-and-shoot film camera with a built-in lens and flash. Rounded pocket-size body. Shutter and flash work. Light marks from use.',
      condition: 'Used, good',
      askingPrice: 90,
      floorPrice: 60,
      sellerName: 'Saddar Vintage',
      sellerStyle: 'shrewd old-school bazaar trader, loves to haggle',
      location: 'Karachi',
      image: '/img/camera.svg',
    },
    {
      id: 'lst_chappal',
      createdAt: now,
      title: 'Handmade Peshawari chappal',
      description:
        'Black leather Peshawari chappal (sandal), hand-stitched with white sole stitching, cross-over front and a buckled back strap, size 42. New, never worn.',
      condition: 'New',
      askingPrice: 40,
      floorPrice: 28,
      sellerName: 'Qissa Khwani Leather',
      sellerStyle: 'proud craftsman, generous with tea but not with discounts',
      location: 'Peshawar',
      image: '/img/chappal.svg',
    },
  ];
}

module.exports = { listings, findPhoto };
