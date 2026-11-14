// Utility functions for file downloads - avoids direct DOM manipulation

/**
 * Downloads a file from a URL
 * @param url - The URL of the file to download
 * @param filename - The name to save the file as
 */
export const downloadFile = async (url: string, filename: string): Promise<void> => {
  try {
    // Send cookies only to our own API. File storage links (Cloudflare R2, or an old Cloudinary link) are
    // signed or public, and a cross-origin storage host rejects credentialed requests.
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const isOwnApi = apiBase !== '' && url.startsWith(apiBase);

    const response = await fetch(url, {
      method: 'GET',
      credentials: isOwnApi ? 'include' : 'omit',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    // Create temporary anchor element
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    
    // Append to body, click, then remove
    document.body.appendChild(anchor);
    anchor.click();
    
    // Cleanup
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(anchor);
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
};

/**
 * Downloads a blob as a file
 * @param blob - The blob to download
 * @param filename - The name to save the file as
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  
  document.body.appendChild(anchor);
  anchor.click();
  
  window.URL.revokeObjectURL(downloadUrl);
  document.body.removeChild(anchor);
};

