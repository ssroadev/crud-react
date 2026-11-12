-- Catálogo de razas. Ejecutar en el editor SQL de Supabase después de 006.
-- No modifica las mascotas existentes: pets.breed conserva el nombre de la raza.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pet_breeds (
  id text PRIMARY KEY,
  species text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (species, name)
);

INSERT INTO public.pet_breeds (id, species, name) VALUES
  ('dog-mixed', 'Perros', 'Mestizo / criollo'),
  ('dog-akita', 'Perros', 'Akita'),
  ('dog-basset-hound', 'Perros', 'Basset hound'),
  ('dog-beagle', 'Perros', 'Beagle'),
  ('dog-bichon-frise', 'Perros', 'Bichón frisé'),
  ('dog-border-collie', 'Perros', 'Border collie'),
  ('dog-boston-terrier', 'Perros', 'Boston terrier'),
  ('dog-boxer', 'Perros', 'Bóxer'),
  ('dog-english-bulldog', 'Perros', 'Bulldog inglés'),
  ('dog-french-bulldog', 'Perros', 'Bulldog francés'),
  ('dog-poodle', 'Perros', 'Caniche / poodle'),
  ('dog-chihuahua', 'Perros', 'Chihuahua'),
  ('dog-chow-chow', 'Perros', 'Chow chow'),
  ('dog-cocker-spaniel', 'Perros', 'Cocker spaniel'),
  ('dog-dalmatian', 'Perros', 'Dálmata'),
  ('dog-doberman', 'Perros', 'Dóberman'),
  ('dog-golden-retriever', 'Perros', 'Golden retriever'),
  ('dog-great-dane', 'Perros', 'Gran danés'),
  ('dog-husky', 'Perros', 'Husky siberiano'),
  ('dog-jack-russell', 'Perros', 'Jack Russell terrier'),
  ('dog-labrador', 'Perros', 'Labrador retriever'),
  ('dog-maltese', 'Perros', 'Maltés'),
  ('dog-german-shepherd', 'Perros', 'Pastor alemán'),
  ('dog-australian-shepherd', 'Perros', 'Pastor australiano'),
  ('dog-belgian-shepherd', 'Perros', 'Pastor belga'),
  ('dog-pekingese', 'Perros', 'Pequinés'),
  ('dog-pinscher', 'Perros', 'Pinscher miniatura'),
  ('dog-pitbull', 'Perros', 'Pitbull'),
  ('dog-pomeranian', 'Perros', 'Pomerania'),
  ('dog-pug', 'Perros', 'Pug'),
  ('dog-rottweiler', 'Perros', 'Rottweiler'),
  ('dog-samoyed', 'Perros', 'Samoyedo'),
  ('dog-schnauzer', 'Perros', 'Schnauzer'),
  ('dog-shar-pei', 'Perros', 'Shar pei'),
  ('dog-shih-tzu', 'Perros', 'Shih tzu'),
  ('dog-dachshund', 'Perros', 'Teckel / salchicha'),
  ('dog-westie', 'Perros', 'West Highland white terrier'),
  ('dog-yorkshire', 'Perros', 'Yorkshire terrier'),
  ('cat-mixed', 'Gatos', 'Mestizo / doméstico'),
  ('cat-abyssinian', 'Gatos', 'Abisinio'),
  ('cat-turkish-angora', 'Gatos', 'Angora turco'),
  ('cat-russian-blue', 'Gatos', 'Azul ruso'),
  ('cat-bengal', 'Gatos', 'Bengalí'),
  ('cat-burmese', 'Gatos', 'Burmés'),
  ('cat-british-shorthair', 'Gatos', 'British shorthair'),
  ('cat-exotic-shorthair', 'Gatos', 'Exótico de pelo corto'),
  ('cat-maine-coon', 'Gatos', 'Maine coon'),
  ('cat-norwegian-forest', 'Gatos', 'Bosque de Noruega'),
  ('cat-persian', 'Gatos', 'Persa'),
  ('cat-ragdoll', 'Gatos', 'Ragdoll'),
  ('cat-scottish-fold', 'Gatos', 'Scottish fold'),
  ('cat-siamese', 'Gatos', 'Siamés'),
  ('cat-siberian', 'Gatos', 'Siberiano'),
  ('cat-sphynx', 'Gatos', 'Sphynx'),
  ('rabbit-mixed', 'Conejos', 'Mestizo'),
  ('rabbit-angora', 'Conejos', 'Angora'),
  ('rabbit-belier', 'Conejos', 'Bélier'),
  ('rabbit-dutch', 'Conejos', 'Holandés'),
  ('rabbit-lionhead', 'Conejos', 'Cabeza de león'),
  ('rabbit-netherland-dwarf', 'Conejos', 'Enano holandés'),
  ('rabbit-rex', 'Conejos', 'Rex')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pet_breeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pet_breeds FROM anon, authenticated;
GRANT ALL ON public.pet_breeds TO service_role;

COMMIT;
