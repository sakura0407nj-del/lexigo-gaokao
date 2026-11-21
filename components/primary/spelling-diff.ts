type Difference='match'|'missing'|'extra'|'replace'|'swap';
interface Column {typed:string;expected:string;kind:Difference}

// Align two spellings, counting a swap of adjacent letters as one edit.
export function spellingDiff(typed:string,answer:string):Column[]{
  const left=Array.from(typed),right=Array.from(answer);
  const a=left.map(letter=>letter.toLowerCase()),b=right.map(letter=>letter.toLowerCase());
  const cost=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  const swapped=(i:number,j:number)=>i+1<a.length&&j+1<b.length&&a[i]!==a[i+1]&&a[i]===b[j+1]&&a[i+1]===b[j];
  for(let i=a.length;i>=0;i--)for(let j=b.length;j>=0;j--){
    if(i===a.length||j===b.length){cost[i][j]=a.length-i+b.length-j;continue;}
    cost[i][j]=Math.min(cost[i+1][j]+1,cost[i][j+1]+1,cost[i+1][j+1]+Number(a[i]!==b[j]));
    if(swapped(i,j))cost[i][j]=Math.min(cost[i][j],cost[i+2][j+2]+1);
  }

  const columns:Column[]=[];
  let i=0,j=0;
  while(i<a.length||j<b.length){
    if(i<a.length&&j<b.length&&a[i]===b[j]){
      columns.push({typed:left[i++],expected:right[j++],kind:'match'});
    }else if(swapped(i,j)&&cost[i][j]===cost[i+2][j+2]+1){
      columns.push({typed:left[i++],expected:right[j++],kind:'swap'},
        {typed:left[i++],expected:right[j++],kind:'swap'});
    }else if(i<a.length&&j<b.length&&cost[i][j]===cost[i+1][j+1]+1){
      columns.push({typed:left[i++],expected:right[j++],kind:'replace'});
    }else if(j<b.length&&cost[i][j]===cost[i][j+1]+1){
      columns.push({typed:'',expected:right[j++],kind:'missing'});
    }else{
      columns.push({typed:left[i++],expected:'',kind:'extra'});
    }
  }
  return columns;
}
