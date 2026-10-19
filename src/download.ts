export function download(
  data: string | Uint8Array,
  filename: string,
  mime: string,
) {
  const blob = new Blob(
    [typeof data === "string" ? data : new Uint8Array(data).buffer],
    { type: mime },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function readFile(
  file: File,
  asText: boolean,
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    if (asText) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}
