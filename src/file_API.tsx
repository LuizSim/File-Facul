import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';


pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

export type ExtractedContent = {
    type: 'text';
    content: string;
};

export async function extractContentFromFile(file: File): Promise<ExtractedContent> {

    if (file.type.startsWith('image/')) {
        try {
            console.log("Iniciando reconhecimento de imagem com Tesseract.js...");
            const { data: { text } } = await Tesseract.recognize(file, 'por', { logger: m => console.log(m) });
            console.log("Reconhecimento de imagem concluído.");
            return { type: 'text', content: text };
        } catch (error) {
            console.error("Erro no OCR com Tesseract:", error);
            throw new Error("Não foi possível ler o texto da imagem.");
        }
    }


    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const result = event.target?.result;
                if (!(result instanceof ArrayBuffer)) {

                    if (typeof result === 'string') {
                        resolve({ type: 'text', content: result });
                        return;
                    }
                    return reject(new Error("Falha ao ler o arquivo."));
                }

                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const data = new Uint8Array(result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    let fullText = '';
                    workbook.SheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        const csvText = XLSX.utils.sheet_to_csv(worksheet);
                        fullText += `--- Planilha: ${sheetName} ---\n${csvText}\n\n`;
                    });
                    resolve({ type: 'text', content: fullText });

                } else if (file.type === 'application/pdf') {
                    const pdfText = await extractPdfText(result);
                    resolve({ type: 'text', content: pdfText });

                } else {
                    reject(new Error("Formato de arquivo não suportado."));
                }
            } catch (error) { reject(error); }
        };
        reader.onerror = (error) => reject(error);


        if (file.type === 'application/pdf' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.readAsArrayBuffer(file);
        } else if (file.type.startsWith('text/') || isCodeFile(file.name)) {
            reader.readAsText(file, 'UTF-8');
        } else {

            reader.readAsArrayBuffer(file);
        }
    });
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
        fullText += pageText + "\n\n";
    }
    return fullText;
}

function isCodeFile(fileName: string): boolean {
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.json', '.py', '.c', '.cpp', '.cs', '.java'];
    return codeExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}