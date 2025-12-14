export interface StorageProvider {
  upload(file: File | Blob | Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
}

// Placeholder implementation
export const storage: StorageProvider = {
  upload: async (file, path) => {
    console.log(`Uploading to ${path}`);
    return path;
  },
  download: async (path) => {
    console.log(`Downloading from ${path}`);
    return Buffer.from('');
  },
};
