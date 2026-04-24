export const CAMERA_PROFILES = [
    { brand: 'iCSee/Geotek', credentials: [['admin', 'admin123']], rtspPaths: ['/live'] },
    { brand: 'Hikvision',    credentials: [['admin', '12345'], ['admin', 'admin']], rtspPaths: ['/Streaming/Channels/101', '/h264/ch1/main/av_stream'] },
    { brand: 'Dahua',        credentials: [['admin', 'admin'], ['admin', '']], rtspPaths: ['/cam/realmonitor?channel=1&subtype=0'] },
    { brand: 'Reolink',      credentials: [['admin', ''], ['admin', 'admin']], rtspPaths: ['/h264Preview_01_main', '/live'] },
    { brand: 'Foscam',       credentials: [['admin', ''], ['admin', 'admin']], rtspPaths: ['/videoMain'] },
    { brand: 'TP-Link',      credentials: [['admin', 'admin'], ['admin', '12345']], rtspPaths: ['/stream1', '/live/main'] },
    { brand: 'Genérica',     credentials: [['admin', 'admin'], ['admin', '123456'], ['admin', '888888']], rtspPaths: ['/live', '/stream', '/ch0/0'] },
];
