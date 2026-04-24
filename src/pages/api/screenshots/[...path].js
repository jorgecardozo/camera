import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { path: pathSegments, download } = req.query;
    // pathSegments is an array from [...path] catch-all
    const filename = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;

    // Guard against path traversal
    const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
    const filePath = path.resolve(screenshotsDir, filename);
    if (!filePath.startsWith(screenshotsDir + path.sep) && filePath !== screenshotsDir) {
        return res.status(400).json({ error: 'Ruta inválida' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const isDownload = download === '1';
    const disposition = isDownload
        ? `attachment; filename="${path.basename(filePath)}"`
        : 'inline';

    res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'image/jpeg',
        'Content-Disposition': disposition,
    });
    fs.createReadStream(filePath).pipe(res);
}
