/** Speech-only rendering of dictionary placeholders; never alters stored words or accepted answers. */
export function dictationSpeechText(value:string):string {
  return value.normalize('NFKC')
    .replace(/\bsb\.?(?=\s|$|['’])/gi,'somebody')
    .replace(/\bsth\.?(?=\s|$|['’])/gi,'something')
    .replace(/\.{2,}|…+/g,' ')
    .replace(/[/()（）]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
