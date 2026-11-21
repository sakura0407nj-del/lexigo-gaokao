// Letter groups shown as blanks. They are reading aids and never change an accepted answer.
const chunks:Record<string,string>={
  apple:'ap ple',apples:'ap ples',animal:'an i mal',afternoon:'af ter noon',
  banana:'ba na na',basketball:'bas ket ball',beautiful:'beau ti ful',between:'be tween',
  birthday:'birth day',classroom:'class room',colourful:'col our ful',computer:'com pu ter',
  december:'de cem ber',different:'dif fer ent',elephant:'el e phant',family:'fam i ly',
  favourite:'fa vour ite',football:'foot ball',holiday:'hol i day',hospital:'hos pi tal',
  important:'im por tant',interesting:'in ter est ing',library:'li brar y',remember:'re mem ber',
  saturday:'sat ur day',schoolbag:'school bag',tomato:'to ma to',together:'to geth er',
  tomorrow:'to mor row',umbrella:'um brel la',wednesday:'wednes day',wonderful:'won der ful'
};

export function spellingGroups(word:string){
  return word.trim().split(/[\s-]+/).flatMap(part=>(chunks[part.toLowerCase()]??part).split(' '))
    .map(part=>part.replace(/[^a-z]/gi,'').length).filter(Boolean);
}
