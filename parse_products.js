import fs from 'fs';

const raw = fs.readFileSync('raw_products.txt', 'utf-8');
const lines = raw.split('\n');

const products = [];
let currentCategory = 'Almacén';

function findImageUrl(name, category) {
    const n = name.toLowerCase();
    if (n.includes('quilmes')) return 'https://d3ugyf2ht6aenh.cloudfront.net/stores/001/151/835/products/quilmes-clasica-botella-1-litro2-dd9c1f4fe4aada581815949576402484-640-0.jpg';
    if (n.includes('brahma')) return 'https://d3ugyf2ht6aenh.cloudfront.net/stores/001/151/835/products/brahma-1lt1-0fe8cfcf16ea98c7dc15904603953798-640-0.png';
    if (n.includes('stella')) return 'https://images.rappi.com.ar/products/stella1litro-1634579977051.png';
    if (n.includes('heineken')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/653063/Cerveza-Heineken-1000-Cc-1-789643.jpg';
    if (n.includes('coca cola') || n.includes('coca')) return 'https://d1on8qs0xdu5jz.cloudfront.net/webapp/images/fotos/b/0000000000/1066_1.jpg';
    if (n.includes('fernet branca')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/634426/Fernet-Branca-750-Cc-1-31477.jpg';
    if (n.includes('sprite')) return 'https://d1on8qs0xdu5jz.cloudfront.net/webapp/images/fotos/b/0000000000/1068_1.jpg';
    if (n.includes('fanta')) return 'https://d1on8qs0xdu5jz.cloudfront.net/webapp/images/fotos/b/0000000000/1067_1.jpg';
    if (n.includes('dr lemon')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/703666/1242944.jpg';
    if (n.includes('gancia')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/703561/1301016.jpg';
    if (n.includes('smirnoff')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/634569/Vodka-Smirnoff-Tradicional-700-Cc-1-36423.jpg';
    if (n.includes('red label')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/634676/Whisky-Johnnie-Walker-Red-Label-1-Ltr-1-36773.jpg';
    if (n.includes('guaymallen')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/769715/Alfajor-Guaymallen-Dulce-De-Leche-38-Gr-1-840428.jpg';
    if (n.includes('jorgito')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/771092/Alfajor-Jorgito-Chocolate-50-Gr-1-29433.jpg';
    if (n.includes('don satur')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/413009/Bizcocho-Don-Satur-Agridulce-200-Gr-1-100230.jpg';
    if (n.includes('oreo')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/581561/Galletitas-Oreo-118-Gr-1-79752.jpg';
    if (n.includes('pepitos') || n.includes('pepito')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/601633/Galletitas-Pepitos-119-Gr-1-807106.jpg';
    if (n.includes('chocolinas')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/751287/1271616.jpg';
    if (n.includes('taragui')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/762551/1239016.jpg';
    if (n.includes('playadito')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/765089/Yerba-Mate-Playadito-Suave-1-Kg-1-38148.jpg';
    if (n.includes('cbse') || n.includes('cbsé')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/785860/Yerba-Cbse-Hierbas-Serranas-500-Gr-1-103328.jpg';
    if (n.includes('rosamonte')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/785669/Yerba-Mate-Rosamonte-Plus-1-Kg-1-49938.jpg';
    if (n.includes('hellmans') || n.includes('hellmann')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/771343/Mayonesa-Hellmanns-Clasica-Doip-P-475-Gr-2-888258.jpg';
    if (n.includes('natura')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/770284/Aceite-De-Girasol-Natura-1-5-Lts-1-881855.jpg';
    if (n.includes('cañuelas')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/767175/Aceite-Canuelas-Girasol-1.5-Litros-1-41901.jpg';
    if (n.includes('knorr')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/763155/Pure-De-Papas-Knorr-Con-Zapallo-100-Gr-1-10777.jpg';
    if (n.includes('cimes')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/703666/1242944.jpg'; // placeholder
    if (n.includes('baggio') || n.includes('bggio')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/582046/Jugo-Baggio-Multifruta-1.5-Lt-1-29007.jpg';
    if (n.includes('termidor')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/581896/Vino-Tinto-Termidor-1-Lt-1-31405.jpg';
    if (n.includes('uvita')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/767980/Vino-Uvita-Tinto-Cabernet-Sauvignon-1-Lt-2-843818.jpg';
    if (n.includes('rutini')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/634421/Vino-Rutini-Cabernet-Malbec-750-Cc-1-778841.jpg';
    
    // Add missing brands specifically requested in the prompt lists
    if (n.includes('budweiser')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/653066/Cerveza-Budweiser-1000-Cc-1-807908.jpg';
    if (n.includes('miller')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/794356/Cerveza-Miller-710cc-1-20986.jpg';
    if (n.includes('amstel')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/653133/Cerveza-Malt-Clasica-Amstel-Lata-473-Cc-2-881515.jpg';
    if (n.includes('schneider')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/653155/Cerveza-Schneider-Lata-473-Cc-1-805494.jpg';
    if (n.includes('pepsi')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/702952/Gaseosa-Pepsi-Cola-15-Lts-1-58356.jpg';
    if (n.includes('seven up') || n.includes('7up')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/702970/Gaseosa-7-Up-1-5-Lts-1-58352.jpg';
    if (n.includes('manaos')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/532398/Gaseosa-Manaos-Naranja-2.25-Lts-1-37053.jpg';
    if (n.includes('levite')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/702905/Agua-Saborizada-Levite-Pomelo-1.5-C-1-31835.jpg';
    if (n.includes('cepita')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/726615/1242502.jpg';
    if (n.includes('villavicencio')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/724967/Agua-Mineral-Villavicencio-Sin-Gas-1-5-Lt-1-12502.jpg';
    if (n.includes('campari')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/634427/Aperitivo-Campari-750-Cc-1-38379.jpg';
    if (n.includes('speed')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/542151/Bebida-Energizante-Speed-Unlimited-250-Cc-1-840445.jpg';
    if (n.includes('monster')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/760431/Bebida-Energizante-Monster-Energy-473-Cc-1-29177.jpg';
    if (n.includes('lucchetti') || n.includes('luchetti')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/767104/Fideos-Tallarin-Lucchetti-500-Gr-1-10023.jpg';
    if (n.includes('pureza')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/767073/Harina-Pureza-0000-C-Levadura-1-Kg-1-36473.jpg';
    if (n.includes('ledesma')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/762580/Azucar-Clasico-Ledesma-1-Kg-1-58348.jpg';
    if (n.includes('raid')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/771694/Repelente-Raid-Aerosol-360-Cc-1-48967.jpg';
    if (n.includes('off')) return 'https://jumboargentina.vtexassets.com/arquivos/ids/771804/1310103.jpg';
    if (n.includes('marlboro')) return 'https://cdn.batitienda.com/b2b/brands/Marlboro.png';
    if (n.includes('lucky strike')) return 'https://cdn.batitienda.com/b2b/brands/LuckyStrike.png';
    if (n.includes('philip morris')) return 'https://cdn.batitienda.com/b2b/brands/PhilipMorris.png';
    if (n.includes('chesterfield')) return 'https://cdn.batitienda.com/b2b/brands/Chesterfield.png';
    

    let cleanName = encodeURIComponent(name.trim());
    return `https://ui-avatars.com/api/?name=${cleanName}&background=random&size=400&font-size=0.33&bold=true`;
}

for (const line of lines) {
    const tLine = line.trim();
    if (!tLine) continue;

    const match = tLine.match(/(.*?)\$\s*([\d\.]+)/);
    
    if (match) {
        let nameRaw = match[1].trim();
        let priceStr = match[2].replace(/\./g, '');
        let price = parseInt(priceStr, 10);
        let sku = nameRaw.substring(0, 3).toUpperCase() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        products.push({
            name: nameRaw,
            sku: sku,
            description: nameRaw,
            category: currentCategory,
            price: price,
            cost: Math.floor(price * 0.7),
            stock: 100,
            status: 'active',
            imageUrl: findImageUrl(nameRaw, currentCategory)
        });
    } else {
        if (tLine.length > 3 && tLine === tLine.toUpperCase()) {
           const potentialCat = tLine.split(' ')[0];
           if (potentialCat) {
               currentCategory = potentialCat.charAt(0).toUpperCase() + potentialCat.slice(1).toLowerCase();
            }
        }
    }
}

fs.writeFileSync('src/data/products.json', JSON.stringify(products, null, 2));
console.log(`Parsed ${products.length} products.`);
