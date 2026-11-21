export function readTextFile(file: Blob): Promise<string> {
  return typeof file.text === 'function' ? file.text() : new Response(file).text();
}
