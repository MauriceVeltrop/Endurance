"use client";
import { useState } from "react";

export default function Home() {

const m = true;

const sporten = [
  "Hardlopen",
  "Wielrennen"
];

const leeg = {
  titel:"",
  sport:"Hardlopen",
  datum:"",
  tijd:"",
  locatie:""
};

const [t,s] = useState([
{
id:1,
titel:"Duurloop Brunssummerheide",
sport:"Hardlopen",
datum:"17 mei",
tijd:"09:00",
locatie:"Brunssummerheide",
deelnemers:["Maurice","Ronald"]
},
{
id:2,
titel:"Racefiets Parkstad",
sport:"Wielrennen",
datum:"18 mei",
tijd:"10:00",
locatie:"Landgraaf",
deelnemers:["Ronald"]
}
]);

const [open,setOpen] = useState(false);
const [editId,setEditId] = useState(null);
const [f,setF] = useState(leeg);

const mee = (id)=>
s(
t.map(x =>
x.id===id && !x.deelnemers.includes("Jij")
? {...x,deelnemers:[...x.deelnemers,"Jij"]}
: x
)
);

const del = (id)=>
confirm("Training verwijderen?")
&& s(t.filter(x=>x.id!==id));

const nieuw = ()=>{
setEditId(null);
setF(leeg);
setOpen(true);
};const bewerk = (id)=>{
const x = t.find(a=>a.id===id);
if(!x) return;

setEditId(id);

setF({
titel:x.titel,
sport:x.sport,
datum:x.datum,
tijd:x.tijd,
locatie:x.locatie
});

setOpen(true);
};

const save = (e)=>{
e.preventDefault();

if(!f.titel || !f.datum || !f.tijd || !f.locatie){
alert("Vul alle velden in");
return;
}

if(editId){

s(
t.map(x =>
x.id===editId
? {...x,...f}
: x
)
);

}else{

s([
{
id:Date.now(),
...f,
deelnemers:[]
},
...t
]);

}

setOpen(false);
setEditId(null);
setF(leeg);
};

return(

<main
style={{
background:"#050505",
color:"white",
minHeight:"100vh",
padding:20,
fontFamily:"sans-serif"
}}
>

{m && (
<button
onClick={nieuw}
style={{
background:"#e4ef16",
color:"black",
border:"none",
padding:"12px 16px",
borderRadius:12,
fontWeight:"bold",
marginBottom:20
}}
>
+ Training toevoegen
</button>
)}

<header
style={{
display:"flex",
justifyContent:"center",
marginBottom:25
}}
>
<img
src="/logo-endurance.png"
alt="Endurance"
style={{height:70,width:"auto"}}
/>
</header>

{open && (

<form
onSubmit={save}
style={{
background:"#111",
padding:20,
borderRadius:24,
marginBottom:20,
display:"grid",
gap:12
}}
>

<input
value={f.titel}
onChange={(e)=>setF({...f,titel:e.target.value})}
placeholder="Titel"
style={veld}
/>

<div>
<div style={{marginBottom:6,opacity:0.8}}>
Kies sport
</div>

<select
value={f.sport}
onChange={(e)=>setF({...f,sport:e.target.value})}
style={veld}
>
{sporten.map(sport=>(
<option key={sport} value={sport}>
{sport}
</option>
))}
</select>

</div>

<input
value={f.datum}
onChange={(e)=>setF({...f,datum:e.target.value})}
placeholder="Datum"
style={veld}
/>

<input
value={f.tijd}
onChange={(e)=>setF({...f,tijd:e.target.value})}
placeholder="Tijd"
style={veld}
/>

<input
value={f.locatie}
onChange={(e)=>setF({...f,locatie:e.target.value})}
placeholder="Locatie"
style={veld}
/>

<div style={{display:"flex",gap:10}}>

<button
type="submit"
style={{
background:"#e4ef16",
color:"black",
border:"none",
padding:"10px 14px",
borderRadius:10,
fontWeight:"bold"
}}
>
Opslaan
</button>

<button
type="button"
onClick={()=>setOpen(false)}
style={{
background:"#2a2a2a",
color:"white",
border:"none",
padding:"10px 14px",
borderRadius:10
}}
>
Annuleren
</button>

</div>

</form>

)}

{t.map(x => (

<div
key={x.id}
style={{
background:"#111",
padding:20,
borderRadius:24,
marginBottom:20
}}
>

<h2 style={{fontSize:28}}>
{x.titel}
</h2>

<p>{x.sport}</p>

<p>
{x.datum} · {x.tijd}
</p>

<p>{x.locatie}</p>

<p style={{opacity:0.7}}>
Deelnemers: {x.deelnemers.length}
</p>

<div style={{display:"flex",gap:10}}>

<button
onClick={()=>mee(x.id)}
style={{
background:"#e4ef16",
color:"black",
border:"none",
padding:"10px 14px",
borderRadius:10,
fontWeight:"bold"
}}
>
Ik doe mee
</button>

{m && (
<button
onClick={()=>bewerk(x.id)}
style={{
background:"#2a2a2a",
color:"white",
border:"none",
padding:"10px 14px",
borderRadius:10
}}
>
Bewerk
</button>
)}

{m && (
<button
onClick={()=>del(x.id)}
style={{
background:"#5a1f1f",
color:"white",
border:"none",
padding:"10px 14px",
borderRadius:10
}}
>
Verwijder
</button>
)}

</div>

</div>

))}

</main>
);
}

const veld={
width:"100%",
background:"#1b1b1b",
color:"white",
border:"1px solid #333",
padding:"12px",
borderRadius:10,
boxSizing:"border-box"
};
  
  
