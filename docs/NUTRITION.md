# Nutrition

Log what you eat and see calories and macros against your daily targets, next to your training.
It is a module (Settings → Modules → **Nutrition**), so someone who only wants a training log never
sees it.

## Turning it on

Nutrition came after the other modules, so it follows them until you choose: with no choice saved,
it is on only when **every other module is on** (the **Everything** preset). Someone who picked
**Just training** or **Training and body** does not suddenly find a food log. Flip its switch in
Settings → Modules and that choice holds from then on, whatever the other switches do.

With it on you get a **Nutrition** tab in the bottom bar, a card on Home with today's calories
against the target (one tap logs food), and **Settings → Nutrition targets**.

## A day

**Nutrition** opens on today. The arrows beside the date step through earlier days
(`#/nutrition?d=YYYY-MM-DD`); there is no logging into the future.

- The top card: calories eaten, how many are left (or over), and a bar per macro against its target.
- **Coach**: what to eat next, see [The coach](#the-coach) below.
- **Breakfast, Lunch, Dinner, Snack**, each with what was logged, its grams, and its calories and
  macros. Tap an entry to change its grams or delete it; swipe left deletes too, with Undo.

**Add food** (or **+** beside a meal) opens the food list: search, or pick from **Favourites**,
**Recent** and **All foods**. Then the amount: type the grams, tap a quick amount (50, 100, 150,
200 g) or one of the food's own servings ("1 egg", 50 g). The meal is picked by the time of day and
can be changed before adding.

An entry keeps the nutrients of its grams **as they were when it was logged**, and the food's name
too. Changing a food's numbers later, or deleting the food, never changes what you already ate.
Changing an entry's grams scales its own numbers.

## Foods

**Foods** (the list icon on the Nutrition screen) is your library. Every food holds its values
**per 100 g**, as on a label: calories, protein, carbs, fat and fibre. Optionally up to eight
servings ("1 slice" = 30 g) and a **Favourite** switch, which puts it first when adding food.

A food can't be saved with more than 900 kcal per 100 g (pure fat is 884), more than 100 g of
any nutrient per 100 g, or protein, carbs and fat together over 100 g. An entry can't be more than
5000 g.

### Starter foods

So the list isn't empty on day one, the first visit adds 21 common foods with approximate values
from USDA FoodData Central: rice (white and brown), roti, dal, chickpeas, egg, egg white, chicken
breast, paneer, milk, curd, oats, banana, apple, potato, peanut butter, almonds, olive oil, whey,
tofu and soya chunks. They are ordinary foods: edit them to match what you buy, or delete them.

Five differ a lot between brands and are marked so in their form: **roti, paneer, whey, tofu and
soya chunks**. Copy the numbers from your packaging.

Deleted starter foods stay deleted. **Add 3 starter foods** (with the number missing) at the bottom
of Foods brings them back.

## Targets

**Settings → Nutrition targets** (or the target icon on the Nutrition screen) sets the daily
calories, protein, carbs, fat and fibre. Until you set them they are 2200 kcal, 140 g protein,
250 g carbs, 70 g fat and 30 g fibre. Emptying a field goes back to that default. Each target syncs
on its own, so protein set on the phone and calories set on the laptop both hold.

## History

The chart icon on the Nutrition screen: the average day over the last seven days you logged, a
bar per day against the calorie target, and every day with anything logged in the last 60 days.
Tap a day to open it. A day with nothing logged was not tracked: it is left out of the averages,
not counted as a day without food.

## The coach

The Nutrition screen has a coach of its own, the counterpart of the
[check-in after each set](AI_COACH.md#a-check-in-after-each-set) in a workout. It runs on the
device from local rules (`frontend/src/lib/nutrition-coach.js`): no AI, no account, instant and
offline. It does not need the AI Coach to be set up.

- **The Coach card** under the day's totals shows the three tips that matter most right now.
- **After adding a food**, the toast names it with the coach's first tip, for example
  *"Chicken breast added. 94 g protein left. Get about 47 g in your next meal, like 200 g Chicken
  breast."* **More** opens every tip for the day.

What it looks at, most important first:

| Tip | When |
| --- | --- |
| Calories over | The day passed its calorie target. |
| Meal balance | The meal just added (200 kcal or more) is mostly fat (over 60 % of its calories), mostly carbs (over 70 %), or under 12 % protein. |
| Protein | Protein still to eat, spread over the meals left, with a food from your own list and how many grams of it would cover one meal. Or that protein is done. |
| Calories ahead | After noon, eating well ahead of the day's pace. |
| Little room left | Under 350 kcal per meal left, with a light food from your list. |
| Fibre | After 17:00, under 60 % of the fibre target. |
| Training or rest day | The targets it used today (below). |
| Calories left | When nothing else needs saying. |

**Meals left** come from the clock and what is logged: breakfast counts as still to come until
10:00, lunch until 15:00 and dinner until 21:00, as long as nothing is logged in it. With all of
them eaten or past, a snack is still planned for until 22:00. A past day plans no meals; it only
says how the day went.

**Suggested foods** come from your own list: favourites first, then the ones you logged recently,
then the most protein for the calories. Amounts are rounded to 10 g, between 50 and 400 g. A
protein suggestion needs at least 10 g of protein per 100 g; a light one at most 150 kcal and at
least 8 g protein per 100 g.

**Training days** are days with a logged workout, or today while a workout is running. The coach
then aims about 10 % higher on calories and protein and 20 % higher on carbs. On a rest day it aims
5 % lower on calories and 10 % lower on carbs. These are the coach's own aim only: your targets,
the bars and the Home card stay as you set them.

### Ask the Coach

When the [AI Coach](AI_COACH.md) is set up and you agreed to what it reads, the Coach card and the
**More** sheet have **Ask the Coach**. It opens the Coach's chat with your day written in the
message box: what you ate with the grams and meal, the day's totals, the targets the coach used,
whether you trained, and *"What should I eat for the rest of the day?"* (for a past day: *"How did
I do, and what should I change?"*). Nothing is sent until you press send, so a Coach run is never
spent without a tap. You can change the question first.

That message is the only way food names reach the AI Coach. On its own it reads only daily totals
(next section).

## What leaves the device

Food data syncs to your openGym server like the rest of your profile, and nowhere else.

- **The AI Coach** reads your **daily totals** (calories, protein, carbs, fat, fibre) of the last
  14 days and your targets, never the foods, their names or the single entries. Only with the
  Nutrition module **on**, and only after you agreed to a consent screen that names nutrition
  (consent version 3 or later; an older consent is asked again). This is the one module the Coach
  does not read past: food is more personal than training, and someone who switched it off should
  not find it in a prompt. See [MODULES.md](MODULES.md#the-coach-and-the-mcp-server).
- **The MCP server** has three read tools and `log_food` ([mcp/README.md](../mcp/README.md#logging-food)).
  Like its other tools, it answers whatever the module says and tells the client when the app does
  not show it.

## A kitchen scale

Not built yet, but the app is ready for it. The grams field (`components/GramsInput.jsx`) keeps no
state of its own: every change goes through `onChange(grams, how)`, where `how` says what set it
(`typed`, `quick`, `serving`). A scale reading would call the same `onChange` with `'scale'`, and
the entry would be logged with `source: 'scale'`. `source` already exists on every entry
(`manual`, `scale`, `barcode`); the app logs `manual` today, and `barcode` is kept for a barcode
lookup.

## For developers

- `frontend/src/lib/nutrition.js` holds the shapes and the numbers, pure and without imports, so
  the MCP server and the Coach read food the way the app does. `nutrition-seed.js` the starter
  foods; `nutrition-coach.js` the coach's rules. Each has a test beside it.
- The state: `S.foods` (per 100 g), `S.foodLog` (entries with their own `n` nutrients and `d`, the
  local day they count on) and `S.nutritionTargets`. `foods` and `foodLog` merge like custom
  exercises, union by id and field by field, with removals kept in `deleted.foods` /
  `deleted.foodLog` (`lib/sync-merge.js`, `api/sync-stamps.js`). `nutritionTargets` merges per key.
- Screens: `views/Nutrition.jsx` (day, Foods, History), `views/NutritionTargets.jsx`,
  `components/NutritionCoach.jsx`, the Home card in `views/Home.jsx`.
- The Coach's copy is `api/coach/core/nutrition.js`, hand-kept in step with the frontend:
  `frontend/src/lib/coach-nutrition-parity.test.js` compares them.
- New strings are English only for now: the translation checks list them as missing.
