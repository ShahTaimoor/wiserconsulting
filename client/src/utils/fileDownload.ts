// Utility functions for file downloads - avoids direct DOM manipulation

/**
 * Downloads a file from a URL
 * @param url - The URL of the file to download
 * @param filename - The name to save the file as
 */
export const downloadFile = async (url: string, filename: string): Promise<void> => {
  try {
    // Check if it's a Cloudinary URL
    const isCloudinaryUrl = url.includes('cloudinary.com') || url.includes('res.cloudinary.com');

    const response = await fetch(url, {
      method: 'GET',
      credentials: isCloudinaryUrl ? 'omit' : 'include',
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

