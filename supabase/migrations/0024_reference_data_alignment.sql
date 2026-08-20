-- 0024 — align reference data with the canonical seed.
--
-- Background. The operator's assistant inserted categories, brands and
-- delivery zones straight into the remote project after the build. The rows
-- were right in substance and wrong in three details that matter:
--
--   1. Slugs. `/category/[slug]` and `/brand/[slug]` resolve by slug, and the
--      remote carried `closets-storage`, `outdoor`, `shelves-bookcases`,
--      `home-center`, `rahitei-doron`, `shomrat-hazorea` and `sealy` where the
--      application links to `storage`, `garden`, `shelves`, `homecenter`,
--      `rahitey-doron`, `shemerat-hazorea` and `silon`. Every one of those
--      routes would have 404'd, and the seed's own listings resolve their
--      category and brand by the same slugs.
--
--   2. `sealy` is not a spelling variant. The row's name is סילון — Silon, an
--      Israeli manufacturer. Sealy is a different, American company. The slug
--      contradicted the name it sat on.
--
--   3. `intro_he` was null on all twelve categories, so every category page
--      would have rendered without the introduction paragraph it is designed
--      around.
--
-- Method. Corrections are made **in place**, matched on the Hebrew name, so the
-- operator's row ids survive. Nothing is deleted and nothing is truncated: the
-- one row the operator added that the seed did not have — רחובות — is kept, and
-- has been adopted into `db/seed-data.ts` so the two agree from now on.
--
-- Idempotent by construction: the updates are guarded by `is distinct from` and
-- the inserts by `not exists`, so a second run changes nothing. Following the
-- precedent of 0013, this also means a freshly migrated database arrives with a
-- usable taxonomy rather than needing the seed. [D-57]

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
update public.categories c
   set slug = v.slug, sort = v.sort, intro_he = v.intro_he
  from (values
    ('sofas-armchairs', 'ספות וכורסאות', 10, 'ספות וכורסאות יד שנייה במצב מצוין, מבתים פרטיים בגוש דן. כל פריט נבדק על ידינו לפני הפרסום, והמחיר שאתם רואים הוא המחיר שאתם משלמים. ההובלה מתואמת דרכנו — אתם לא צריכים לגייס חברים ורכב.'),
    ('tables', 'שולחנות', 20, 'שולחנות אוכל, שולחנות סלון ושולחנות עבודה יד שנייה. שולחן איכותי הוא הפריט שהכי משתלם לקנות יד שנייה — עץ מלא שומר על עצמו לאורך שנים, והמחיר החדש שלו כמעט תמיד כפול.'),
    ('chairs', 'כיסאות', 30, 'כיסאות אוכל, כיסאות משרד וכיסאות בר יד שנייה. אפשר לקנות סט שלם או להשלים כיסאות בודדים לשולחן קיים — כל המידות מופיעות בעמוד הפריט.'),
    ('beds-mattresses', 'מיטות ומזרנים', 40, 'מיטות זוגיות, מיטות יחיד ומזרנים יד שנייה. מזרנים מתקבלים אצלנו רק במצב כמו חדש, ואנחנו בודקים אותם פיזית לפני האיסוף.'),
    ('storage', 'ארונות ואחסון', 50, 'ארונות בגדים, ארונות אחסון וויטרינות יד שנייה. שימו לב למידות ולשאלת הפירוק — אם הארון דורש פירוק והרכבה זה מופיע בעמוד הפריט ומחושב בעלות ההובלה.'),
    ('dressers', 'שידות וקומודות', 60, 'שידות, קומודות ושידות טלוויזיה יד שנייה. פריטי אחסון קטנים הם הדרך המהירה ביותר לשנות חדר בלי לשפץ אותו.'),
    ('shelves', 'מדפים וספריות', 70, 'ספריות, כונניות ומדפים יד שנייה בגוש דן. ספרייה טובה נשארת יפה עשרות שנים, וכאן היא עולה שליש ממחיר החנות.'),
    ('lighting', 'תאורה', 80, 'מנורות רצפה, מנורות שולחן וגופי תאורה יד שנייה. תאורה היא הפריט שהכי משנה תחושה בחדר ביחס למחיר.'),
    ('rugs', 'שטיחים', 90, 'שטיחים יד שנייה במצב טוב ומעלה. כל שטיח מצולם במלואו כדי שתראו את הגוון האמיתי ואת הבלאי, אם יש.'),
    ('garden', 'ריהוט גן', 100, 'ריהוט גן ומרפסת יד שנייה — פינות ישיבה, שולחנות חוץ וכיסאות. ריהוט חוץ איכותי עמיד לשנים, וביד שנייה הוא נמכר בשבריר מהמחיר.'),
    ('office', 'ריהוט משרדי', 110, 'שולחנות עבודה, כיסאות משרד וארונות תיוק יד שנייה. מתאים גם לפינת עבודה בבית וגם למשרד קטן.'),
    ('misc', 'שונות', 120, 'פריטי ריהוט שלא נכנסים לקטגוריה אחרת — מראות, מתלים, פרגודים ועוד.')
  ) as v(slug, name_he, sort, intro_he)
 where c.name_he = v.name_he
   and (c.slug, c.sort, c.intro_he) is distinct from (v.slug, v.sort, v.intro_he);

insert into public.categories (slug, name_he, sort, intro_he)
select v.slug, v.name_he, v.sort, v.intro_he
  from (values
    ('sofas-armchairs', 'ספות וכורסאות', 10, 'ספות וכורסאות יד שנייה במצב מצוין, מבתים פרטיים בגוש דן. כל פריט נבדק על ידינו לפני הפרסום, והמחיר שאתם רואים הוא המחיר שאתם משלמים. ההובלה מתואמת דרכנו — אתם לא צריכים לגייס חברים ורכב.'),
    ('tables', 'שולחנות', 20, 'שולחנות אוכל, שולחנות סלון ושולחנות עבודה יד שנייה. שולחן איכותי הוא הפריט שהכי משתלם לקנות יד שנייה — עץ מלא שומר על עצמו לאורך שנים, והמחיר החדש שלו כמעט תמיד כפול.'),
    ('chairs', 'כיסאות', 30, 'כיסאות אוכל, כיסאות משרד וכיסאות בר יד שנייה. אפשר לקנות סט שלם או להשלים כיסאות בודדים לשולחן קיים — כל המידות מופיעות בעמוד הפריט.'),
    ('beds-mattresses', 'מיטות ומזרנים', 40, 'מיטות זוגיות, מיטות יחיד ומזרנים יד שנייה. מזרנים מתקבלים אצלנו רק במצב כמו חדש, ואנחנו בודקים אותם פיזית לפני האיסוף.'),
    ('storage', 'ארונות ואחסון', 50, 'ארונות בגדים, ארונות אחסון וויטרינות יד שנייה. שימו לב למידות ולשאלת הפירוק — אם הארון דורש פירוק והרכבה זה מופיע בעמוד הפריט ומחושב בעלות ההובלה.'),
    ('dressers', 'שידות וקומודות', 60, 'שידות, קומודות ושידות טלוויזיה יד שנייה. פריטי אחסון קטנים הם הדרך המהירה ביותר לשנות חדר בלי לשפץ אותו.'),
    ('shelves', 'מדפים וספריות', 70, 'ספריות, כונניות ומדפים יד שנייה בגוש דן. ספרייה טובה נשארת יפה עשרות שנים, וכאן היא עולה שליש ממחיר החנות.'),
    ('lighting', 'תאורה', 80, 'מנורות רצפה, מנורות שולחן וגופי תאורה יד שנייה. תאורה היא הפריט שהכי משנה תחושה בחדר ביחס למחיר.'),
    ('rugs', 'שטיחים', 90, 'שטיחים יד שנייה במצב טוב ומעלה. כל שטיח מצולם במלואו כדי שתראו את הגוון האמיתי ואת הבלאי, אם יש.'),
    ('garden', 'ריהוט גן', 100, 'ריהוט גן ומרפסת יד שנייה — פינות ישיבה, שולחנות חוץ וכיסאות. ריהוט חוץ איכותי עמיד לשנים, וביד שנייה הוא נמכר בשבריר מהמחיר.'),
    ('office', 'ריהוט משרדי', 110, 'שולחנות עבודה, כיסאות משרד וארונות תיוק יד שנייה. מתאים גם לפינת עבודה בבית וגם למשרד קטן.'),
    ('misc', 'שונות', 120, 'פריטי ריהוט שלא נכנסים לקטגוריה אחרת — מראות, מתלים, פרגודים ועוד.')
  ) as v(slug, name_he, sort, intro_he)
 where not exists (select 1 from public.categories c where c.slug = v.slug)
   and not exists (select 1 from public.categories c where c.name_he = v.name_he);

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
update public.brands b
   set slug = v.slug, sort = v.sort
  from (values
    ('ikea', 'איקאה', 10),
    ('habitat', 'Habitat', 20),
    ('id-design', 'ID Design', 30),
    ('beitili', 'ביתילי', 40),
    ('shemerat-hazorea', 'שמרת הזורע', 50),
    ('rahitey-doron', 'רהיטי דורון', 60),
    ('aminach', 'עמינח', 70),
    ('silon', 'סילון', 80),
    ('homecenter', 'HomeCenter', 90),
    ('boconcept', 'BoConcept', 100),
    ('west-elm', 'West Elm', 110),
    ('no-brand', 'ללא מותג', 999)
  ) as v(slug, name, sort)
 where b.name = v.name
   and (b.slug, b.sort) is distinct from (v.slug, v.sort);

insert into public.brands (slug, name, sort)
select v.slug, v.name, v.sort
  from (values
    ('ikea', 'איקאה', 10),
    ('habitat', 'Habitat', 20),
    ('id-design', 'ID Design', 30),
    ('beitili', 'ביתילי', 40),
    ('shemerat-hazorea', 'שמרת הזורע', 50),
    ('rahitey-doron', 'רהיטי דורון', 60),
    ('aminach', 'עמינח', 70),
    ('silon', 'סילון', 80),
    ('homecenter', 'HomeCenter', 90),
    ('boconcept', 'BoConcept', 100),
    ('west-elm', 'West Elm', 110),
    ('no-brand', 'ללא מותג', 999)
  ) as v(slug, name, sort)
 where not exists (select 1 from public.brands b where b.slug = v.slug)
   and not exists (select 1 from public.brands b where b.name = v.name);

-- ---------------------------------------------------------------------------
-- Delivery zones. City is the primary key, so this is a plain upsert: the
-- operator's רחובות row is matched and left as it is, and אזור is restored.
-- ---------------------------------------------------------------------------
insert into public.delivery_zones (city, zone, fee_agorot)
values
    ('תל אביב-יפו', 'A', 14900),
    ('רמת גן', 'A', 14900),
    ('גבעתיים', 'A', 14900),
    ('חולון', 'B', 19900),
    ('בת ים', 'B', 19900),
    ('בני ברק', 'B', 19900),
    ('הרצליה', 'B', 19900),
    ('רמת השרון', 'B', 19900),
    ('פתח תקווה', 'B', 19900),
    ('ראשון לציון', 'B', 19900),
    ('כפר סבא', 'C', 24900),
    ('רעננה', 'C', 24900),
    ('הוד השרון', 'C', 24900),
    ('ראש העין', 'C', 24900),
    ('אור יהודה', 'C', 24900),
    ('יהוד-מונוסון', 'C', 24900),
    ('קריית אונו', 'C', 24900),
    ('גני תקווה', 'C', 24900),
    ('אזור', 'C', 24900),
    ('נס ציונה', 'C', 24900),
    ('רחובות', 'C', 24900)
on conflict (city) do update
  set zone = excluded.zone, fee_agorot = excluded.fee_agorot
where (public.delivery_zones.zone, public.delivery_zones.fee_agorot)
      is distinct from (excluded.zone, excluded.fee_agorot);
