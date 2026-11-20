-- Give attendance entered by teachers the same points as every other attendance write.
-- Keep any nonzero values explicitly configured by an administrator.
UPDATE learning_rule_sets AS policies
SET rules = jsonb_set(policies.rules, '{attendance}', (
  SELECT jsonb_agg(
    CASE
      WHEN item->>'id' = 'PRESENT' AND (item->>'points')::numeric = 0 THEN jsonb_set(item, '{points}', '1'::jsonb)
      WHEN item->>'id' = 'LATE' AND (item->>'points')::numeric = 0 THEN jsonb_set(item, '{points}', '0.5'::jsonb)
      ELSE item
    END ORDER BY ordinal
  )
  FROM jsonb_array_elements(policies.rules->'attendance') WITH ORDINALITY AS entries(item, ordinal)
))
WHERE jsonb_typeof(rules->'attendance') = 'array'
  AND jsonb_array_length(rules->'attendance') > 0;

CREATE OR REPLACE FUNCTION score_learning_attendance() RETURNS trigger AS $$
DECLARE policy JSONB; rule JSONB; chosen TEXT;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW."customStatus" IS NOT DISTINCT FROM OLD."customStatus" AND NEW.points=OLD.points THEN
  NEW.points=OLD.points; NEW."scoringSnapshot"=OLD."scoringSnapshot"; RETURN NEW;
 END IF;
 SELECT rules INTO policy FROM learning_rule_sets WHERE "scopeId" IN ('school',NEW."circleId") ORDER BY ("scopeId" <> 'school') DESC,"createdAt" DESC,id DESC LIMIT 1;
 chosen=COALESCE(NEW."customStatus",NEW.status::text);
 SELECT value INTO rule FROM jsonb_array_elements(COALESCE(policy->'attendance','[]'::jsonb)) WHERE value->>'id'=chosen AND value->>'enabled'='true';
 IF policy IS NOT NULL AND rule IS NULL THEN RAISE EXCEPTION 'Invalid or disabled attendance status'; END IF;
 NEW.points=ROUND((COALESCE((rule->>'points')::DOUBLE PRECISION, CASE chosen WHEN 'PRESENT' THEN 1 WHEN 'LATE' THEN 0.5 ELSE 0 END)*COALESCE((policy#>>'{weights,attendance}')::DOUBLE PRECISION,1))::numeric,2)::DOUBLE PRECISION;
 NEW."scoringSnapshot"=jsonb_build_object('status',chosen,'label',COALESCE(rule->>'label',chosen),'points',NEW.points,'rule',rule,'weights',policy->'weights');
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Writing the new base award invokes the scoring trigger, which applies the
-- circle's configured weight and lets the audit trigger refresh student totals.
UPDATE attendance AS a
SET points = CASE a.status WHEN 'PRESENT' THEN 1 WHEN 'LATE' THEN 0.5 END
WHERE a.status IN ('PRESENT', 'LATE') AND a.points = 0 AND a."customStatus" IS NULL
  AND COALESCE((
    SELECT (
      SELECT (entry->>'enabled')::boolean
      FROM jsonb_array_elements(policy.rules->'attendance') AS entry
      WHERE entry->>'id' = a.status::text
    )
    FROM learning_rule_sets AS policy
    WHERE policy."scopeId" IN ('school', a."circleId")
    ORDER BY (policy."scopeId" <> 'school') DESC, policy."createdAt" DESC, policy.id DESC
    LIMIT 1
  ), true);
