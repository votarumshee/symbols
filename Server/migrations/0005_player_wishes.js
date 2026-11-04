export function up(pgm){pgm.sql(`
CREATE TABLE wishes (
 id text PRIMARY KEY, owner text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 1000),
 created timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wishes_owner_created ON wishes(owner,created DESC);
CREATE TABLE wish_likes (
 wish_id text NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
 owner text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(wish_id,owner)
);
CREATE INDEX wish_likes_owner ON wish_likes(owner);
`);}
export function down(pgm){pgm.sql('DROP TABLE wish_likes; DROP TABLE wishes;');}
