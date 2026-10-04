---
title: "Privatlivspolitik"
description: "Sådan behandler Kristian GG personoplysninger på kristiangg.dk og i kontakten med dig. Med et særskilt afsnit om Google Business Profile og Google OAuth."
hero_title: "Privatlivspolitik"
hero_subtitle: "Hvilke oplysninger der behandles, når du besøger kristiangg.dk eller skriver til mig, og hvordan min egen Google Business Profile administreres."
noindex: false
---

*Senest opdateret 4. oktober 2026.*

## 1. Hvem er ansvarlig

Den dataansvarlige er:

- Kristian G. G. Dansted (Kristian GG)
- CVR 40996761
- Kontakt: kontakt@kristiangg.dk eller [kontaktformularen](/kontakt/)

Behandling af personoplysninger i forbindelse med terapi, forløb og andre ydelser er beskrevet i afsnit 10 i [handels- og samarbejdsbetingelserne](/betingelser/). Denne side supplerer betingelserne og gentager dem ikke.

## 2. Når du besøger hjemmesiden

Hjemmesidens offentlige sider sætter ingen cookies og bruger ingen værktøjer til statistik, annoncering eller sporing. Skrifttyperne hentes fra kristiangg.dk og ikke fra en tredjepart.

Hjemmesiden drives af Netlify. For at kunne levere siderne til din browser behandler Netlify teknisk nødvendige oplysninger som din IP-adresse.

Links til fx Facebook, Trustpilot og samarbejdspartnere er almindelige links. Klikker du på et af dem, gælder det pågældende websteds egne regler.

## 3. Når du skriver via kontaktformularen

Formularen beder om din e-mail, som skal udfyldes, og frivilligt om navn, telefonnummer, emne og en besked. Indsendelsen modtages og opbevares af Netlify, og jeg får besked på e-mail.

Oplysningerne bruges kun til at besvare og følge op på din henvendelse. Det sker på grundlag af databeskyttelsesforordningens artikel 6, stk. 1, litra b (forud for en eventuel aftale) og litra f (min legitime interesse i at kunne svare dig).

Skriv kun det, du har lyst til. Skriver du om dit helbred eller din livssituation, bruges det udelukkende til at svare dig og behandles fortroligt.

## 4. Hvem behandler oplysningerne for mig

Jeg bruger de databehandlere, der står i [betingelserne](/betingelser/): Google (bl.a. mail og kalender), Netlify (hjemmeside og kontaktformular) og Revisorskyen. Til den tekniske drift af hjemmesiden og publiceringen af mine egne opslag bruger jeg desuden GitHub.

Google, Netlify og GitHub er amerikanske virksomheder, og oplysninger kan derfor blive behandlet uden for EU/EØS.

Jeg sælger ikke personoplysninger og bruger dem ikke til annoncering.

## 5. Hvor længe

Oplysninger gemmes kun, så længe det er nødvendigt for formålet, eller så længe loven kræver det, fx bogføringsloven.

## 6. Dine rettigheder

Du har ret til at få indsigt i de oplysninger, jeg har om dig, og til at få dem rettet eller slettet. Du kan også gøre indsigelse, bede om begrænsning af behandlingen og, hvor det er relevant, få dine oplysninger udleveret (dataportabilitet).

Skriv til kontakt@kristiangg.dk.

Er du utilfreds med min behandling af dine oplysninger, kan du klage til [Datatilsynet](https://www.datatilsynet.dk/).

## 7. Google Business Profile og Google OAuth

Dette afsnit handler om, hvordan jeg administrerer **min egen** Google Business Profile. Det vedrører ikke dig som besøgende eller klient. Hjemmesiden beder aldrig besøgende om at logge ind med Google, og ingen anden end mig giver applikationen adgang til en Google-konto.

### Hvad applikationen er

Jeg har en lille, intern publiceringsløsning med navnet *KristianGG publiceringsmotor*. Den lægger opslag ud på Kristian GG's profil på Google, når jeg har godkendt dem på forhånd. Opslagene skrives og godkendes af mig. Løsningen sender kun det, jeg har godkendt, ordret og på det tidspunkt, jeg har valgt.

### Hvorfor Google OAuth

Google kræver, at en applikation, der skal kunne publicere på en Business Profile, får adgang gennem Google OAuth. Adgangen gives én gang af Google-kontoen kontakt@kristiangg.dk, som administrerer profilen. Derefter kan løsningen publicere uden et nyt login hver gang.

### Hvilket scope

Applikationen beder kun om ét scope:

`https://www.googleapis.com/auth/business.manage`

Scopet giver adgang til at administrere de Business Profiles, kontoen har adgang til. Applikationen bruger kun en lille del af det:

- **Konti og profiler:** kontoens navn og type samt profilernes interne id'er, navn, website og adresse læses for at finde og bekræfte den ene profil, der må publiceres til. Kun profilens navn og et afkortet id gemmes, se nedenfor
- **Opslag:** nye opslag oprettes på den profil

Applikationen læser ikke anmeldelser, beskeder, statistik eller andre oplysninger fra profilen og ændrer ikke profilens oplysninger.

### Én fastlåst profil

Første gang adgangen gives, fastlåses én profil som den eneste destination. Før hvert opslag spørger løsningen Google, om adgangen stadig gælder netop den profil. Gør den ikke det, sendes intet. Andre profiler, kontoen måtte have adgang til, bruges ikke.

### Sådan håndteres nøgler og tokens

- **Autorisationskoden** vises én gang i min egen browser på en side på kristiangg.dk, som ikke sender den videre. Jeg lægger den selv ind som en krypteret hemmelighed i GitHub. Når den er byttet til et token, overskrives den.
- **Refresh tokenet** opbevares udelukkende som en krypteret hemmelighed i GitHub Actions. Det er det, der gør, at løsningen kan publicere uden et nyt login.
- **Access tokens** hentes frisk, hver gang løsningen kører. De lever omkring en time, holdes kun i hukommelsen under kørslen og gemmes ingen steder.
- **Client secret** opbevares udelukkende som en krypteret hemmelighed i GitHub Actions.

Client secret, autorisationskode, access tokens og refresh token offentliggøres ikke. De skrives ikke i kildekoden, ikke i dokumentationen og ikke i logfiler. Hver foreslået ændring af kildekoden kontrolleres automatisk for utilsigtede nøgler og tokens.

### Hvad der gemmes, og hvor

Kildekoden til hjemmesiden og publiceringsløsningen ligger i et offentligt repository på GitHub. Ud over de krypterede hemmeligheder gemmes følgende:

- en kort registrering af hvert udsendt opslag: dato, opslagets id hos Google og Googles offentlige link til opslaget
- datoen for den seneste autorisation, profilens navn og et afkortet id

Kørslernes logfiler er synlige for alle, fordi repositoryet er offentligt. Logfilerne kan indeholde profilens navn og afkortede id'er, men aldrig nøgler eller tokens. Ser kontoen ved første autorisation mere end én profil, vises navnene og id'erne på profilerne i loggen, så jeg kan vælge den rigtige.

### Deling

Oplysninger fra Google sendes ikke videre til andre end Google selv og GitHub, hvor løsningen kører og nøglerne opbevares. De sælges ikke og bruges ikke til annoncering.

Brugen og overførslen af oplysninger, som applikationen modtager fra Googles API'er, overholder [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), herunder kravene om begrænset brug (Limited Use).

### Tilbagekaldelse og sletning

Adgangen kan til enhver tid tilbagekaldes på [myaccount.google.com/permissions](https://myaccount.google.com/permissions) ved at fjerne *KristianGG publicering*. Så bliver alle tokens ugyldige med det samme, og løsningen kan ikke længere publicere. Bagefter sletter jeg det gemte refresh token i GitHub.

Udsendte opslag ligger offentligt på Business Profile, indtil de slettes dér. Registreringen af udsendte opslag bevares som log over, hvad der er publiceret.

## 8. Ændringer

Ændres måden, jeg behandler oplysninger på, herunder brugen af Google-data, opdateres denne side, og datoen øverst ændres.
