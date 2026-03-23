function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(fileName: string, text: string, mimeType: string) {
  triggerDownload(new Blob([text], { type: mimeType }), fileName);
}

export function downloadBase64File(fileName: string, base64Payload: string, mimeType: string) {
  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  triggerDownload(new Blob([bytes], { type: mimeType }), fileName);
}
