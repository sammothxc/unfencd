-- 001_init.sql — enable extensions and create base schema

create extension if not exists postgis;
create extension if not exists postgis_topology;
create extension if not exists fuzzystrmatch;    -- used by some ogr2ogr loaders
create extension if not exists postgis_tiger_geocoder;

-- Placeholder tables. Ingest scripts will populate these.
-- All geometries stored in EPSG:4326; spatial indexes use EPSG:3857 via functional index.

create table if not exists public.blm_sma (
    gid          serial primary key,
    admu_name    text,
    admu_st_url  text,
    state_cd     char(2),
    geom         geometry(MultiPolygon, 4326)
);

create index if not exists blm_sma_geom_idx
    on public.blm_sma using gist (geom);
