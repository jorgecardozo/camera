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
    const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
    const filePath = path.resolve(recordingsDir, filename);
    if (!filePath.startsWith(recordingsDir + path.sep) && filePath !== recordingsDir) {
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

    const range = req.headers.range;
    if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
            'Content-Disposition': disposition,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Disposition': disposition,
        });
        fs.createReadStream(filePath).pipe(res);
    }
}
