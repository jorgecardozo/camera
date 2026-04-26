-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 554,
    "httpPort" INTEGER NOT NULL DEFAULT 80,
    "rtspPath" TEXT NOT NULL DEFAULT '/live',
    "credentialsEncrypted" TEXT NOT NULL DEFAULT '',
    "continuousRecord" BOOLEAN NOT NULL DEFAULT false,
    "motionDetect" BOOLEAN NOT NULL DEFAULT false,
    "motionSensitivity" REAL NOT NULL DEFAULT 0.12,
    "telegramBotToken" TEXT NOT NULL DEFAULT '',
    "telegramChatId" TEXT NOT NULL DEFAULT '',
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyObjects" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Camera_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cameraId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "screenshotPath" TEXT,
    CONSTRAINT "Event_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
