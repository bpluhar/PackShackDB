-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For better text search

-- Drop tables if they exist (in correct order)
DROP TABLE IF EXISTS audio_files_tags CASCADE;
DROP TABLE IF EXISTS audio_files CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS subcategories CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS sample_packs CASCADE;
DROP TABLE IF EXISTS manufacturers CASCADE;
DROP TABLE IF EXISTS folders CASCADE;

-- Create tables
CREATE TABLE manufacturers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    website VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sample_packs (
    id SERIAL PRIMARY KEY,
    manufacturer_id INTEGER REFERENCES manufacturers(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    release_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(manufacturer_id, name)  -- Prevent duplicate pack names per manufacturer
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subcategories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)  -- Prevent duplicate subcategories within a category
);

-- Create the folders table
CREATE TABLE folders (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(512) NOT NULL,
    path_parts TEXT[] DEFAULT ARRAY[name],
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    full_path TEXT,  -- This will be populated by the trigger
    UNIQUE(parent_id, name)
);

-- Create the audio files table
CREATE TABLE audio_files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(512) NOT NULL,  -- Increased the length
    filepath VARCHAR(512) NOT NULL UNIQUE,  -- Increased the length
    original_filename VARCHAR(512) NOT NULL,  -- Increased the length
    fingerprint VARCHAR(512) NOT NULL UNIQUE,
    manufacturer_id INTEGER REFERENCES manufacturers(id) ON DELETE SET NULL,
    sample_pack_id INTEGER REFERENCES sample_packs(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    file_size BIGINT NOT NULL,
    duration FLOAT NULL,
    file_type VARCHAR(50) NOT NULL,
    key_signature VARCHAR(10) NULL,
    bpm FLOAT NULL,
    sample_rate INTEGER,
    bit_depth INTEGER,
    channels SMALLINT,
    last_modified TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (file_size > 0),
    CHECK (duration IS NULL OR duration > 0),
    CHECK (bpm IS NULL OR bpm > 0),
    CHECK (channels IS NULL OR channels > 0)
);

-- Create the tags table
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create the audio files tags table
CREATE TABLE audio_files_tags (
    audio_file_id INTEGER REFERENCES audio_files(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (audio_file_id, tag_id)
);

-- Insert default categories
INSERT INTO categories (name, description) VALUES
('Drums', 'Drum samples and loops'),
('Bass', 'Bass samples and loops'),
('FX', 'Sound effects and transitions'),
('Synth', 'Synthesizer samples and loops'),
('Vocals', 'Vocal samples and loops'),
('Melody', 'Melodic samples and loops'),
('One Shots', 'Single hit samples'),
('Loops', 'Audio loops and phrases');

-- Insert default subcategories
INSERT INTO subcategories (category_id, name) VALUES
(1, 'Kicks'),
(1, 'Snares'),
(1, 'Hi-hats'),
(1, 'Cymbals'),
(1, 'Percussion'),
(1, 'Drum Loops'),
(2, 'Bass Loops'),
(2, 'Bass One Shots'),
(3, 'Impacts'),
(3, 'Risers'),
(3, 'Downlifters'),
(3, 'Transitions'),
(4, 'Lead'),
(4, 'Pad'),
(4, 'Pluck'),
(4, 'Atmosphere');

-- Insert default manufacturers
INSERT INTO manufacturers (name, website) VALUES
('Cymatics', 'https://cymatics.fm'),
('Splice', 'https://splice.com'),
('Native Instruments', 'https://native-instruments.com'),
('KSHMR', 'https://dharmatunestudios.com'),
('Vengeance', 'https://vengeance-sound.com'),
('Black Octopus', 'https://blackoctopus-sound.com'),
('Ghost Hack', 'https://ghosthack.de'),
('Sample Magic', 'https://samplemagic.com'),
('Loopmasters', 'https://loopmasters.com'),
('Wave Alchemy', 'https://wavealchemy.com'),
('ADSR', 'https://adsr.com'),
('Capsun ProAudio', 'https://capsunproaudio.com'),
('Function Loops', 'https://functionloops.com'),
('Industrial Strength', 'https://industrialstrength.com'),
('Producer Loops', 'https://producerloops.com');

-- Create enhanced indexes for better performance
CREATE INDEX idx_audio_files_sample_pack ON audio_files(sample_pack_id);
CREATE INDEX idx_audio_files_category ON audio_files(category_id);
CREATE INDEX idx_audio_files_subcategory ON audio_files(subcategory_id);
CREATE INDEX idx_audio_files_folder ON audio_files(folder_id);
CREATE INDEX idx_audio_files_bpm ON audio_files(bpm) WHERE bpm IS NOT NULL;
CREATE INDEX idx_audio_files_key ON audio_files(key_signature) WHERE key_signature IS NOT NULL;
CREATE INDEX idx_audio_files_manufacturer ON audio_files(manufacturer_id);
CREATE INDEX idx_audio_files_filename_trgm ON audio_files USING gin (filename gin_trgm_ops);
CREATE INDEX idx_folders_path_trgm ON folders USING gin (full_path gin_trgm_ops);
CREATE INDEX idx_tags_name_trgm ON tags USING gin (name gin_trgm_ops);
CREATE INDEX idx_audio_files_created ON audio_files(created_at);

-- Create helper functions
CREATE OR REPLACE FUNCTION search_audio_files(
    search_term TEXT,
    manufacturer_id_param INTEGER DEFAULT NULL,
    category_id_param INTEGER DEFAULT NULL,
    min_bpm FLOAT DEFAULT NULL,
    max_bpm FLOAT DEFAULT NULL
) RETURNS TABLE (
    id INTEGER,
    filename TEXT,
    manufacturer_name TEXT,
    pack_name TEXT,
    bpm FLOAT,
    key_signature TEXT,
    duration FLOAT,
    category_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        af.id,
        af.filename,
        m.name as manufacturer_name,
        sp.name as pack_name,
        af.bpm,
        af.key_signature,
        af.duration,
        c.name as category_name
    FROM audio_files af
    LEFT JOIN manufacturers m ON af.manufacturer_id = m.id
    LEFT JOIN sample_packs sp ON af.sample_pack_id = sp.id
    LEFT JOIN categories c ON af.category_id = c.id
    WHERE 
        (search_term IS NULL OR 
         af.filename ILIKE '%' || search_term || '%' OR
         af.original_filename ILIKE '%' || search_term || '%')
        AND (manufacturer_id_param IS NULL OR af.manufacturer_id = manufacturer_id_param)
        AND (category_id_param IS NULL OR af.category_id = category_id_param)
        AND (min_bpm IS NULL OR af.bpm >= min_bpm)
        AND (max_bpm IS NULL OR af.bpm <= max_bpm)
    ORDER BY af.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO packshack;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO packshack;

-- Create function to update full_path based on path_parts
CREATE OR REPLACE FUNCTION update_full_path() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.full_path := array_to_string(NEW.path_parts, '/');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update full_path on insert or update
CREATE TRIGGER trigger_update_full_path
BEFORE INSERT OR UPDATE ON folders
FOR EACH ROW
EXECUTE FUNCTION update_full_path();
