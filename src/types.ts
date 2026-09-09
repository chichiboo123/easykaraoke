export type Segment={id:string;text:string;start:number;end:number};
export type LyricBlock={id:string;text:string;roleId:string;segments:Segment[]};
export type Role={id:string;name:string;color:string};
export type Marker={id:string;type:'intro'|'interlude'|'ending'|'custom';label:string;start:number;end:number;countdown:0|2|4};
export type Preset='classic'|'stage'|'dream'|'classroom'|'retro'|'minimal';
export type KaraokeProject={version:1;id:string;updatedAt:number;meta:{title:string;musical:string;number:string;composer:string;lyricist:string};roles:Role[];lyricBlocks:LyricBlock[];style:{preset:Preset;fontFamily:string;colorMode:'common'|'role';progress:boolean;background?:string;brightness:number;darken:number;blur:number};markers:Marker[];media:{name:string;type:string;duration:number};};
export const uid=()=>crypto.randomUUID();
export const newProject=(title:string):KaraokeProject=>({version:1,id:uid(),updatedAt:Date.now(),meta:{title,musical:'',number:'',composer:'',lyricist:''},roles:[{id:'all',name:'전체',color:'#ffd43b'}],lyricBlocks:[],style:{preset:'classic',fontFamily:'TJ Joy',colorMode:'common',progress:true,brightness:100,darken:25,blur:0},markers:[],media:{name:'',type:'',duration:0}});
