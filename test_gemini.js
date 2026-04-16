import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getUrls() {
    const products = JSON.parse(fs.readFileSync('src/data/products.json', 'utf-8'));
    // Just test for first 3
    const subset = products.slice(0, 3).map(p => p.name);
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Encuentra una URL directa a una imagen real (.jpg o .png) de internet para cada uno de estos productos de supermercado argentino. Tiene que ser una foto del producto real. Devuelve un JSON estricto en este formato: { "Producto 1": "https://url...", "Producto 2": "https://url..." }. Productos: ${JSON.stringify(subset)}`,
            config: { responseMimeType: "application/json" }
        });
        console.log(response.text);
    } catch (e) {
        console.error(e);
    }
}
getUrls();
