import fs from 'fs';

async function searchImage(query) {
    try {
        const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`);
        const data = await response.json();
        if (data && data.products && data.products.length > 0) {
            const product = data.products.find(p => p.image_url || p.image_front_url);
            if (product) {
                return product.image_url || product.image_front_url;
            }
        }
        return null;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function run() {
    console.log("Quilmes:", await searchImage('Cerveza Quilmes'));
    console.log("Coca Cola 2.25:", await searchImage('Coca Cola 2.25'));
    console.log("Fernet Branca:", await searchImage('Fernet Branca'));
}
run();
