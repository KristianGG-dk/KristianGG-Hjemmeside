---
title: "{{ replace .Name "-" " " | title }}"
description: ""
draft: true

# Starttidspunkt. Begivenhedens dato MAA IKKE staa i "date" — Hugo udelader
# fremtidsdaterede sider fra bygningen, og begivenheden ville forsvinde,
# indtil den var overstaaet. Derfor et selvstaendigt felt.
start: ""   # fx 2026-11-08T10:00:00+01:00
slut: ""    # valgfri

# Kategorien hedder "kategori", IKKE "type". "type" er reserveret af Hugo og
# styrer, hvilken skabelon siden bruger — "type: skovbad" ville faa Hugo til at
# lede efter layouts/skovbad/ og falde tilbage til standardskabelonen.
kategori: "skovbad"   # skovbad | kursus | foredrag | retreat

sted: ""
adresse: ""
postnr: ""
by: ""

pris: ""        # tal giver " kr" og en offers-blok i structured data.
                # Tekst ("Skriv for pris") vises som den staar, uden offers.
pris_note: ""
pladser: ""
medbring: ""
# Udfyldes kun, naar en samarbejdspartner er arrangoer. Saa staar de som
# arrangoer, og Kristian GG saettes automatisk som medarrangoer.
arrangoer: ""
arrangoer_url: ""

# Eksternt billetlink. Er det sat, peger tilmeldingsknappen derhen i stedet
# for paa kontaktformularen.
billet_url: ""
billet_tekst: ""

aflyst: false
aflyst_grund: ""
tilmelding_lukket: false

hero_subtitle: ""
faq: []
---

Skriv her, hvad begivenheden er, hvem den er for, og hvad der sker undervejs.
