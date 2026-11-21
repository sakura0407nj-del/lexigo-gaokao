/** UTF-8 BOM, CRLF and quoted cells keep bilingual lists readable in mobile Excel. */
export function primaryCsv(rows:readonly (readonly string[])[]):string {
  const cell=(raw:string)=>{
    const value=/^[\s\uFEFF]*[=+@-]/.test(raw)?"'"+raw:raw;
    return '"'+value.replace(/"/g,'""')+'"';
  };
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
