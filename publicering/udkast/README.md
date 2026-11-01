# Udkast

Her ligger indhold, der **ikke** er godkendt.

Ingen del af motoren læser denne mappe. Alle udvælgelser — Facebook,
Instagram, LinkedIn og Google — læser `publicering/laase`, og de kan ikke se
et element uden låsefil. Filerne ligger desuden uden for `content/`, så Hugo
bygger dem ikke, og `genopbyg-planlagt` kan ikke komme til at udgive dem.

Et merge af en gren med udkast publicerer derfor ingenting.

Hver pakke er en mappe med ét udkast pr. element plus en oversigtsfil med
samme navn. Oversigten skal indeholde resultatet af

```
node publicering/scripts/redaktionel-balance.mjs publicering/udkast/<pakke>
node publicering/scripts/tekstgentagelse.mjs <udkast> <landingsside>
```

så fordelingen kan ses frem for at skulle opdages ved at læse igennem.

Når Kristian har godkendt, bliver udkastet en låsefil i `publicering/laase/`,
oversigten kopieres til `publicering/pakker/`, og posterne kommer i
`koe.json`. **Udkastet her er ikke sandhedskilden bagefter** — låsefilen er.

Et elementnummer genbruges aldrig. Aflyses et element, bliver nummeret stående
som aflyst, så registrets historik kan læses.
