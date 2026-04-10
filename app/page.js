"use client";
import { useState } from "react";

export default function Home() {

const [trainingen,setTrainingen] = useState([
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
sport:"Fietsen",
datum:"18 mei",
tijd:"10:00",
locatie:"Landgraaf",
deelnemers:["Ronald"]
}
])

function doeMee(id){

setTrainingen(
trainingen.map(t =>
t.id===id
? {...t,deelnemers:[...t.deelnemers,"Jij"]}
: t
)
)

}

return(

<main style={{background:"#050505",color:"white",minHeight:"100vh",padding:"20px",fontFamily:"sans-serif"}}>

<header style={{display:"flex",alignItems:"center",gap:"15px",marginBottom:"25px"}}>

<img src="/logo-endurance.png" style={{width:"60px"}}/>

<div>
<h1>ENDURANCE</h1>
<p style={{opacity:0.6}}>Train samen</p>
</div>

</header>

{trainingen.map(t => (

<div key={t.id} style={{background:"#111",padding:"20px",borderRadius:"15px",marginBottom:"15px"}}>

<h2>{t.titel}</h2>

<p>{t.sport}</p>
<p>{t.datum} · {t.tijd}</p>
<p>{t.locatie}</p>

<p style={{opacity:0.7}}>
Deelnemers: {t.deelnemers.length}
</p>

<button
onClick={()=>doeMee(t.id)}
style={{
marginTop:"10px",
background:"#e4ef16",
color:"black",
border:"none",
padding:"10px 15px",
borderRadius:"10px",
fontWeight:"bold"
}}
>

Ik doe mee

</button>

</div>

))}

</main>

)

}
