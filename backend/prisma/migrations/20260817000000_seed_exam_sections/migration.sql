INSERT INTO "exam_sections"
("id", "name", "code", "order", "isRequired", "pagesCount", "minScore", "description", "isActive")
SELECT
  gen_random_uuid(),
  v.name,
  v.code,
  v."order",
  true,
  20,
  60,
  v.description,
  true
FROM (
  VALUES
    ('الجزء 30','JUZ-30',1),
    ('الجزء 29','JUZ-29',2),
    ('الجزء 28','JUZ-28',3),
    ('الجزء 27','JUZ-27',4),
    ('الجزء 26','JUZ-26',5),
    ('الجزء 25','JUZ-25',6),
    ('الجزء 24','JUZ-24',7),
    ('الجزء 23','JUZ-23',8),
    ('الجزء 22','JUZ-22',9),
    ('الجزء 21','JUZ-21',10),
    ('الجزء 20','JUZ-20',11),
    ('الجزء 19','JUZ-19',12),
    ('الجزء 18','JUZ-18',13),
    ('الجزء 17','JUZ-17',14),
    ('الجزء 16','JUZ-16',15),
    ('الجزء 15','JUZ-15',16),
    ('الجزء 14','JUZ-14',17),
    ('الجزء 13','JUZ-13',18),
    ('الجزء 12','JUZ-12',19),
    ('الجزء 11','JUZ-11',20),
    ('الجزء 10','JUZ-10',21),
    ('الجزء 9','JUZ-09',22),
    ('الجزء 8','JUZ-08',23),
    ('الجزء 7','JUZ-07',24),
    ('الجزء 6','JUZ-06',25),
    ('الجزء 5','JUZ-05',26),
    ('الجزء 4','JUZ-04',27),
    ('الجزء 3','JUZ-03',28),
    ('الجزء 2','JUZ-02',29),
    ('الجزء 1','JUZ-01',30)
) AS v(name, code, "order")
WHERE NOT EXISTS (
  SELECT 1
  FROM "exam_sections" e
  WHERE e.code = v.code
     OR e."order" = v."order"
);
