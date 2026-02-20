CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  default_finding_visibility TEXT DEFAULT 'public'
    CHECK (default_finding_visibility IN ('public', 'approximate', 'private')),
  notification_preferences JSONB DEFAULT '{
    "season_alerts": true,
    "forum_replies": true,
    "finding_comments": true
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE mushroom_species (
  id SERIAL PRIMARY KEY,
  norwegian_name TEXT NOT NULL,
  latin_name TEXT NOT NULL UNIQUE,
  english_name TEXT,
  family TEXT,
  genus TEXT,
  description TEXT,
  cap_description TEXT,
  stem_description TEXT,
  gills_description TEXT,
  flesh_description TEXT,
  spore_description TEXT,
  smell TEXT,
  taste TEXT,
  edibility TEXT NOT NULL
    CHECK (edibility IN ('edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly')),
  edibility_notes TEXT,
  toxin_info TEXT,
  symptoms TEXT,
  habitat TEXT[],
  substrate TEXT,
  mycorrhizal_partners TEXT[],
  altitude_range INT4RANGE,
  season_start INT NOT NULL CHECK (season_start BETWEEN 1 AND 12),
  season_end INT NOT NULL CHECK (season_end BETWEEN 1 AND 12),
  peak_season_start INT,
  peak_season_end INT,
  regions TEXT[],
  commonality TEXT CHECK (commonality IN ('very_common', 'common', 'uncommon', 'rare', 'very_rare')),
  data_source TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER species_updated_at
  BEFORE UPDATE ON mushroom_species
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_species_search ON mushroom_species
USING GIN (
  to_tsvector('norwegian',
    COALESCE(norwegian_name, '') || ' ' ||
    COALESCE(latin_name, '') || ' ' ||
    COALESCE(english_name, '') || ' ' ||
    COALESCE(description, '')
  )
);

CREATE TABLE species_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  species_id INT REFERENCES mushroom_species(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  photo_type TEXT DEFAULT 'general'
    CHECK (photo_type IN ('general', 'cap', 'stem', 'gills', 'spores', 'habitat', 'look_alike')),
  photographer TEXT,
  license TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_species_photos_species ON species_photos(species_id);

CREATE TABLE look_alikes (
  id SERIAL PRIMARY KEY,
  species_id INT REFERENCES mushroom_species(id) ON DELETE CASCADE NOT NULL,
  look_alike_id INT REFERENCES mushroom_species(id) ON DELETE CASCADE NOT NULL,
  similarity_description TEXT,
  difference_description TEXT,
  danger_level TEXT CHECK (danger_level IN ('low', 'medium', 'high', 'critical')),
  UNIQUE(species_id, look_alike_id),
  CHECK (species_id != look_alike_id)
);

CREATE TABLE findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  species_id INT REFERENCES mushroom_species(id),
  species_name_override TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location_accuracy FLOAT,
  display_latitude DOUBLE PRECISION,
  display_longitude DOUBLE PRECISION,
  location_name TEXT,
  altitude FLOAT,
  image_url TEXT,
  thumbnail_url TEXT,
  ai_used BOOLEAN DEFAULT FALSE,
  ai_top_suggestion TEXT,
  ai_confidence FLOAT,
  ai_raw_response JSONB,
  user_confirmed_species BOOLEAN DEFAULT FALSE,
  notes TEXT,
  quantity TEXT CHECK (quantity IN ('single', 'few', 'many', 'abundant')),
  habitat_observed TEXT,
  visibility TEXT DEFAULT 'public'
    CHECK (visibility IN ('public', 'approximate', 'private')),
  verification_status TEXT DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'community_verified', 'expert_verified')),
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  found_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER findings_updated_at
  BEFORE UPDATE ON findings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_findings_geo ON findings
  USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
CREATE INDEX idx_findings_user ON findings(user_id);
CREATE INDEX idx_findings_species ON findings(species_id);
CREATE INDEX idx_findings_visibility ON findings(visibility);
CREATE INDEX idx_findings_found_at ON findings(found_at DESC);

CREATE OR REPLACE FUNCTION randomize_location(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_meters INT DEFAULT 500
) RETURNS TABLE(rand_lat DOUBLE PRECISION, rand_lng DOUBLE PRECISION) AS $$
DECLARE
  angle DOUBLE PRECISION;
  distance DOUBLE PRECISION;
BEGIN
  angle := random() * 2 * pi();
  distance := sqrt(random()) * radius_meters;
  rand_lat := lat + (distance / 111320) * cos(angle);
  rand_lng := lng + (distance / (111320 * cos(radians(lat)))) * sin(angle);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_display_location()
RETURNS TRIGGER AS $$
DECLARE
  result RECORD;
BEGIN
  IF NEW.visibility = 'approximate' THEN
    SELECT * INTO result FROM randomize_location(NEW.latitude, NEW.longitude);
    NEW.display_latitude := result.rand_lat;
    NEW.display_longitude := result.rand_lng;
  ELSIF NEW.visibility = 'public' THEN
    NEW.display_latitude := NEW.latitude;
    NEW.display_longitude := NEW.longitude;
  ELSE
    NEW.display_latitude := NULL;
    NEW.display_longitude := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER findings_set_display_location
  BEFORE INSERT OR UPDATE OF visibility, latitude, longitude ON findings
  FOR EACH ROW EXECUTE FUNCTION set_display_location();

CREATE TABLE forum_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  finding_id UUID REFERENCES findings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  category TEXT NOT NULL CHECK (category IN ('find', 'question', 'tip', 'discussion')),
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  reported_count INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_posts_user ON forum_posts(user_id);
CREATE INDEX idx_posts_category ON forum_posts(category);
CREATE INDEX idx_posts_created ON forum_posts(created_at DESC);
CREATE INDEX idx_posts_popular ON forum_posts(likes_count DESC, created_at DESC);

CREATE TABLE comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  likes_count INT DEFAULT 0,
  reported_count INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_post ON comments(post_id, created_at);
CREATE INDEX idx_comments_user ON comments(user_id);

CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_count_trigger
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

CREATE TABLE post_likes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_likes_count_trigger
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

CREATE TABLE comment_likes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE saved_posts (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES findings(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'misinformation', 'dangerous_advice', 'harassment', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int + (finding_id IS NOT NULL)::int = 1)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE mushroom_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE species_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE look_alikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiler er synlige for alle" ON profiles FOR SELECT USING (true);
CREATE POLICY "Brukere kan oppdatere egen profil" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Brukere kan opprette egen profil" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Arter er synlige for alle" ON mushroom_species FOR SELECT USING (true);
CREATE POLICY "Artsbilder er synlige for alle" ON species_photos FOR SELECT USING (true);
CREATE POLICY "Forvekslingsarter er synlige for alle" ON look_alikes FOR SELECT USING (true);

CREATE POLICY "Offentlige funn er synlige for alle" ON findings
  FOR SELECT USING (visibility IN ('public', 'approximate') OR user_id = auth.uid());
CREATE POLICY "Brukere kan opprette egne funn" ON findings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brukere kan oppdatere egne funn" ON findings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Brukere kan slette egne funn" ON findings FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Innlegg er synlige for alle" ON forum_posts FOR SELECT USING (is_hidden = false);
CREATE POLICY "Innloggede kan opprette innlegg" ON forum_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brukere kan redigere egne innlegg" ON forum_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Brukere kan slette egne innlegg" ON forum_posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Kommentarer er synlige for alle" ON comments FOR SELECT USING (is_hidden = false);
CREATE POLICY "Innloggede kan kommentere" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brukere kan redigere egne kommentarer" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Brukere kan slette egne kommentarer" ON comments FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Likes er synlige for alle" ON post_likes FOR SELECT USING (true);
CREATE POLICY "Innloggede kan like" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brukere kan fjerne egne likes" ON post_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Comment likes synlige" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "Innloggede kan like kommentarer" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brukere kan fjerne comment likes" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Kun egne lagrede" ON saved_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Kan lagre innlegg" ON saved_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Kan fjerne lagrede" ON saved_posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Kun egne rapporter" ON reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "Innloggede kan rapportere" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE OR REPLACE VIEW public_findings AS
SELECT
  f.id,
  f.user_id,
  p.username,
  p.avatar_url,
  f.species_id,
  ms.norwegian_name,
  ms.latin_name,
  ms.edibility,
  CASE
    WHEN f.visibility = 'public' THEN f.latitude
    WHEN f.visibility = 'approximate' THEN f.display_latitude
    ELSE NULL
  END as display_lat,
  CASE
    WHEN f.visibility = 'public' THEN f.longitude
    WHEN f.visibility = 'approximate' THEN f.display_longitude
    ELSE NULL
  END as display_lng,
  f.thumbnail_url,
  f.verification_status,
  f.found_at,
  f.quantity,
  f.notes
FROM findings f
JOIN profiles p ON f.user_id = p.id
LEFT JOIN mushroom_species ms ON f.species_id = ms.id
WHERE f.visibility IN ('public', 'approximate');

CREATE OR REPLACE VIEW species_in_season AS
SELECT
  ms.*, sp.image_url as primary_image_url, sp.thumbnail_url as primary_thumbnail_url
FROM mushroom_species ms
LEFT JOIN species_photos sp ON ms.id = sp.species_id AND sp.is_primary = true
WHERE
  CASE
    WHEN ms.season_start <= ms.season_end THEN
      EXTRACT(MONTH FROM NOW()) BETWEEN ms.season_start AND ms.season_end
    ELSE
      EXTRACT(MONTH FROM NOW()) >= ms.season_start OR EXTRACT(MONTH FROM NOW()) <= ms.season_end
  END;

CREATE OR REPLACE FUNCTION get_findings_in_bounds(
  min_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  species_filter INT DEFAULT NULL,
  month_filter INT DEFAULT NULL
)
RETURNS SETOF public_findings AS $$
BEGIN
  RETURN QUERY
  SELECT pf.*
  FROM public_findings pf
  WHERE pf.display_lat BETWEEN min_lat AND max_lat
    AND pf.display_lng BETWEEN min_lng AND max_lng
    AND (species_filter IS NULL OR pf.species_id = species_filter)
    AND (month_filter IS NULL OR EXTRACT(MONTH FROM pf.found_at) = month_filter)
  ORDER BY pf.found_at DESC
  LIMIT 500;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION search_species(search_query TEXT)
RETURNS SETOF mushroom_species AS $$
BEGIN
  RETURN QUERY
  SELECT ms.*
  FROM mushroom_species ms
  WHERE
    to_tsvector('norwegian',
      COALESCE(ms.norwegian_name, '') || ' ' ||
      COALESCE(ms.latin_name, '') || ' ' ||
      COALESCE(ms.english_name, '') || ' ' ||
      COALESCE(ms.description, '')
    ) @@ plainto_tsquery('norwegian', search_query)
    OR ms.norwegian_name ILIKE '%' || search_query || '%'
    OR ms.latin_name ILIKE '%' || search_query || '%'
  ORDER BY
    CASE WHEN ms.norwegian_name ILIKE search_query THEN 0
         WHEN ms.norwegian_name ILIKE search_query || '%' THEN 1
         WHEN ms.latin_name ILIKE search_query THEN 2
         ELSE 3
    END,
    ms.norwegian_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE(
  total_findings BIGINT,
  unique_species BIGINT,
  total_posts BIGINT,
  total_likes_received BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM findings WHERE user_id = p_user_id),
    (SELECT COUNT(DISTINCT species_id) FROM findings WHERE user_id = p_user_id AND species_id IS NOT NULL),
    (SELECT COUNT(*) FROM forum_posts WHERE user_id = p_user_id),
    (SELECT COALESCE(SUM(likes_count), 0) FROM forum_posts WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
