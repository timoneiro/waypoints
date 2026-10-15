# Changelog

What's new in waypoints, newest first. This file is shown in the app (Settings → What's new).

<!--
Every user-facing change bumps "version" in package.json and adds an entry here (a test enforces it).
Heading: "## x.y.z — YYYY-MM-DD". Body: short paragraphs and "- " bullets; inline **bold** and `code`.
Write for people who use the app, not for developers.
-->

## 0.9.1 — 2026-10-15

See your cash at a glance on the Money tab.

- **Cash left**: each foreign currency in Exchange rates shows how much cash you have left, from what you changed minus what you spent in cash.
- **Cash or card**: expense rows show a small Cash or Card tag where it's noted.
- **Card vs cash**: a line under the categories splits what you've spent into card, cash and not noted.

## 0.9.0 — 2026-10-13

The trip report: the whole trip on one page, once it's over.

- **Trip report**: what it cost (by category, by day, and who paid what), whether everyone has
  settled up, the best and worst of the trip with everyone's stars and notes, the stays and
  journeys, places you saved but never got to, a photo a day, and a few numbers to remember it by.
  Open it from the Plan tab once the trip is over, or any time from the Trip tab to see it so far.
- **Two versions**: the full report for the group, and a **shareable** one for anyone else, with the
  trip and its reviews but no names, notes or photos. What it cost is left out unless you add it.
- **Keep it or send it**: print it or save it as a PDF, or save it as a file that opens in any
  browser, to keep or send in a chat.
- **One report for everyone**: on a trip on a sync server, the report is kept on the server once the
  trip is over, so everyone opens the same one. If the trip changes after that, anyone can make it
  again. A sync server needs updating to keep reports: until then, each phone shows its own.

## 0.8.0 — 2026-10-13

Reviews: remember what was worth it.

- **Rate what you did**: activities, places, stays and journeys get a **Reviews** card once they've
  started (places once they're ticked **Been there**). Give 1 to 5 stars, add a note, or tap
  **Didn't go**. Everyone in the group writes their own, and they show side by side.
- **Your list to review**: once things are over, the Plan tab shows how many are waiting for you. Tap
  it to rate them one after another, then see everyone's reviews, the latest or the top rated first.
- A place that's in the plan is reviewed through its activities, and its page shows their reviews.
- Reviews are yours: if the app doesn't know which traveller you are on this phone, it asks first.
- They travel in links and on the sync server like everything else. Phones on an older version of the
  app don't show them, and a sync server needs updating to keep them.

## 0.7.0 — 2026-10-13

Cash or card, for every expense.

- **Cash or card in the trip's currency too**: expenses in your own currency now say how they were
  paid, like the ones in other currencies already did. It doesn't change what they count for: it's
  there so you can tell later which ones won't be in your bank app.
- A new expense starts as paid the same way as the last one in its currency (card if there isn't
  one yet), so it's usually already right. Payments to settle up start as **Card or bank**.
- Expenses added before this don't say: open one and tap **Edit** to note it.
- Phones on an older version of the app don't show it for the trip's currency, and editing an
  expense there forgets it.

## 0.6.0 — 2026-10-13

Documents for connecting flights.

- **One booking, every flight**: flights bought together share a booking ref. Give each of them the
  same one, and a document added to one of them (the e-ticket, the receipt) shows on all of them.
- A document added to a flight on a booking with others is **for every flight on that booking**
  unless you untick it, so a boarding pass for one flight can stay on that flight. Photos stay on
  their own flight unless you tick it. Change it later from the document's **Edit** page.
- It works for trains, buses and ferries on one booking too.
- Phones on an older version of the app show these documents only on the flight they were added to.

## 0.5.0 — 2026-10-13

Cities, airports and time zones, filled in for you.

- **Cities as you type**: start typing a city and pick it from a list of the world's towns (15,000
  people or more), with the ones already in your trip on top. It works offline: the list comes with
  the app. Picking a city also sets its time zone.
- **Airports for flights**: type a city, an airport's name or its code ("nrt", "heathrow") and pick
  it. It reads "Tokyo (NRT)", and the departure and arrival times switch to each airport's time zone.
  Trains, buses and ferries get the city list.
- **Time zones that follow your trip**: something new is in the time zone of wherever your journeys
  have taken you by that day. The day after a flight to Japan, new activities are in Japan time.
- **Addresses**: address fields suggest the ones already in the trip, such as your hotel's for an
  activity there, and fill in the city too.
- **Online address search**, if you want it: turn it on in Settings → **Address search** to look up
  any address as you type. It uses OpenStreetMap (through Photon), needs internet, and sends what you
  type in the address field to it. It's off unless you turn it on.

## 0.4.0 — 2026-10-09

Photos and documents: for the whole trip, or for any stay, journey, activity, place or expense.

- **Photos tab**: the trip's documents at the top (tickets, boarding passes, bookings, insurance),
  and its photos below, by day.
- **On any item**: add photos and documents from a stay, a journey, an activity, a place or an
  expense (a receipt, say). Move one to another item, or to the whole trip, whenever you like.
- **Offline**: documents are kept on your phone, so they open at the gate without signal.
- **Shared through the sync server**: on a trip on the server, everyone on it gets them by
  themselves. Documents come in full; photos come as small previews, and in full once you open
  one. Links can't carry files, so on a trip that's only on your phone they stay on your phone.
- **Only on this phone**: keep a passport or your own boarding pass to yourself. It's never sent
  to the server, and you can share it later if you change your mind.
- Photos are made smaller when you add them (to about 1 MB), which also leaves out where they were
  taken. The originals stay in your phone's gallery.
- Backup files keep their names and captions, but not the files themselves.

If you run a sync server, update it to share photos and documents: an older server keeps
everything else working, and the files wait on your phone.

## 0.3.0 — 2026-10-09

An optional sync server: changes reach the group by themselves.

- **Sync server**: connect to a waypoints server (for example one on a home NAS) in Settings →
  **Sync server**. The trips you put on it reach everyone on it, and every change after that,
  without sending links. It's optional: everything works without it, as before.
- **Private trips**: a trip on the server is seen only by the people on it. Pick them from the
  server with a tap when you create the trip.
- **Mixed groups**: someone who isn't on the server is added by name, as before, and gets links.
  Changes they send you by link go up to the server too.
- **Put a trip on the server** later from the Trip tab. It keeps working the same, and links already
  sent still work.
- **Offline is fine**: changes made without signal wait on your phone and go up the next time the
  server can be reached.
- Joining is by invite from whoever runs the server. A trip you leave stays in its group, with your
  expenses.

## 0.2.0 — 2026-10-09

Card payments and paying back part of what you owe.

- **Cash or card**: an expense in another currency now says how it was paid. Cash converts at the
  rate your withdrawals got, as before. For a card, type what the bank charged.
- **Add the card cost later**: not in your bank app yet? Save the expense without it. It's marked
  **cost pending**, counts at your cash rate meanwhile, and the Money tab tells you how many are
  waiting (and which are yours).
- **Pay back part of it**: "Record payment" now opens the payment, filled in, so you can change the
  amount. Owe €100 and gave back €35? Record €35, and €65 stays owed. **+ Payment** in Balances
  records any other payment.

## 0.1.0 — 2026-10-08

The first version of waypoints: your trips in one place, on your phone, offline and without an account.

- **Trips** with the people going, the dates, a home time zone and the currency you count in.
- **Stays, transport and activities** with times in their own time zone, booking references,
  addresses, phone numbers and links. Tap to copy a booking reference, call the host, or get
  directions in Google or Apple Maps.
- **Day-by-day plan** that shows where you sleep each night and, during the trip, what's on today
  and what's next.
- **Places to see**, grouped by city, with must-sees, a visited tick and one tap to plan a visit.
- **Shared expenses** in any currency, split equally or by exact amounts, with balances and the
  fewest payments to settle up.
- **Exchange rates from your own money**: note a cash withdrawal or a money exchange once
  ("10,000 JPY for €62.50") and every expense in that currency is converted at the rate you actually
  got, fees included. Several exchanges are averaged, and a card payment can have its own rate.
- **Calendar export**: download the whole trip for Google or Apple Calendar, or add single items to
  Google Calendar.
- **Share with your group** as a link in your chat. Opening it adds the trip, or merges in everyone's
  changes. No server: the trip travels inside the link.
- **Backups**: save all your trips to a file and import them on another phone.
