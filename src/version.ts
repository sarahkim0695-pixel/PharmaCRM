/** Versionsangabe (wird beim Bauen aus package.json + Datum gesetzt, siehe vite.config.ts). */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? 'dev';
