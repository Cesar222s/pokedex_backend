const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();
const POKEAPI = process.env.POKEAPI_BASE_URL || 'https://pokeapi.co/api/v2';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

async function cachedFetch(url) {
  const now = Date.now();
  if (cache.has(url)) {
    const entry = cache.get(url);
    if (now - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PokeAPI error: ${response.status}`);
  const data = await response.json();
  cache.set(url, { data, timestamp: now });
  return data;
}

// Region → Generation mapping
const regionToGeneration = {
  kanto: 1,
  johto: 2,
  hoenn: 3,
  sinnoh: 4,
  unova: 5,
  kalos: 6,
  alola: 7,
  galar: 8,
  paldea: 9
};

// GET /api/pokemon — list with filters
router.get('/', async (req, res) => {
  try {
    const { name, type1, type2, region, limit = 20, offset = 0 } = req.query;

    // If searching by name, use the PokeAPI directly
    if (name) {
      try {
        const pokemon = await cachedFetch(`${POKEAPI}/pokemon/${name.toLowerCase()}`);
        const simplified = {
          id: pokemon.id,
          name: pokemon.name,
          sprites: pokemon.sprites,
          types: pokemon.types.map(t => t.type.name)
        };
        return res.json({ results: [simplified], count: 1 });
      } catch {
        return res.json({ results: [], count: 0 });
      }
    }

    // If filtering by type
    if (type1 || type2) {
      let pokemonIds = null;

      if (type1) {
        const typeData = await cachedFetch(`${POKEAPI}/type/${type1.toLowerCase()}`);
        const ids1 = new Set(typeData.pokemon.map(p => {
          const parts = p.pokemon.url.split('/');
          return parseInt(parts[parts.length - 2]);
        }));
        pokemonIds = ids1;
      }

      if (type2) {
        const typeData = await cachedFetch(`${POKEAPI}/type/${type2.toLowerCase()}`);
        const ids2 = new Set(typeData.pokemon.map(p => {
          const parts = p.pokemon.url.split('/');
          return parseInt(parts[parts.length - 2]);
        }));
        if (pokemonIds) {
          pokemonIds = new Set([...pokemonIds].filter(id => ids2.has(id)));
        } else {
          pokemonIds = ids2;
        }
      }

      // Filter by region if also specified
      if (region && regionToGeneration[region.toLowerCase()]) {
        const genId = regionToGeneration[region.toLowerCase()];
        const genData = await cachedFetch(`${POKEAPI}/generation/${genId}`);
        const regionSpecies = new Set(genData.pokemon_species.map(s => {
          const parts = s.url.split('/');
          return parseInt(parts[parts.length - 2]);
        }));
        pokemonIds = new Set([...pokemonIds].filter(id => regionSpecies.has(id)));
      }

      const sortedIds = [...pokemonIds].sort((a, b) => a - b);
      const total = sortedIds.length;
      const paged = sortedIds.slice(Number(offset), Number(offset) + Number(limit));

      const results = await Promise.all(
        paged.map(async (id) => {
          const pokemon = await cachedFetch(`${POKEAPI}/pokemon/${id}`);
          return {
            id: pokemon.id,
            name: pokemon.name,
            sprites: pokemon.sprites,
            types: pokemon.types.map(t => t.type.name)
          };
        })
      );

      return res.json({ results, count: total });
    }

    // If filtering by region only
    if (region && regionToGeneration[region.toLowerCase()]) {
      const genId = regionToGeneration[region.toLowerCase()];
      const genData = await cachedFetch(`${POKEAPI}/generation/${genId}`);
      const speciesIds = genData.pokemon_species
        .map(s => {
          const parts = s.url.split('/');
          return parseInt(parts[parts.length - 2]);
        })
        .sort((a, b) => a - b);

      const total = speciesIds.length;
      const paged = speciesIds.slice(Number(offset), Number(offset) + Number(limit));

      const results = await Promise.all(
        paged.map(async (id) => {
          const pokemon = await cachedFetch(`${POKEAPI}/pokemon/${id}`);
          return {
            id: pokemon.id,
            name: pokemon.name,
            sprites: pokemon.sprites,
            types: pokemon.types.map(t => t.type.name)
          };
        })
      );

      return res.json({ results, count: total });
    }

    // Default: paginated list
    const listData = await cachedFetch(`${POKEAPI}/pokemon?limit=${limit}&offset=${offset}`);
    const results = await Promise.all(
      listData.results.map(async (p) => {
        const pokemon = await cachedFetch(p.url);
        return {
          id: pokemon.id,
          name: pokemon.name,
          sprites: pokemon.sprites,
          types: pokemon.types.map(t => t.type.name)
        };
      })
    );

    res.json({ results, count: listData.count });
  } catch (err) {
    console.error('Pokemon list error:', err);
    res.status(500).json({ error: 'Failed to fetch Pokémon' });
  }
});

// GET /api/pokemon/types — list all types
router.get('/types', async (req, res) => {
  try {
    const data = await cachedFetch(`${POKEAPI}/type`);
    const types = data.results
      .map(t => t.name)
      .filter(name => name !== 'unknown' && name !== 'shadow');
    res.json({ types });
  } catch (err) {
    console.error('Types error:', err);
    res.status(500).json({ error: 'Failed to fetch types' });
  }
});

// GET /api/pokemon/regions — list all regions
router.get('/regions', (req, res) => {
  res.json({ regions: Object.keys(regionToGeneration) });
});

// GET /api/pokemon/:id — full detail
router.get('/:id', async (req, res) => {
  try {
    const pokemon = await cachedFetch(`${POKEAPI}/pokemon/${req.params.id}`);
    res.json({
      id: pokemon.id,
      name: pokemon.name,
      height: pokemon.height,
      weight: pokemon.weight,
      base_experience: pokemon.base_experience,
      sprites: pokemon.sprites,
      types: pokemon.types.map(t => ({ slot: t.slot, name: t.type.name })),
      stats: pokemon.stats.map(s => ({ name: s.stat.name, base_stat: s.base_stat })),
      abilities: pokemon.abilities.map(a => ({ name: a.ability.name, is_hidden: a.is_hidden })),
      moves: pokemon.moves.slice(0, 20).map(m => m.move.name)
    });
  } catch (err) {
    console.error('Pokemon detail error:', err);
    res.status(500).json({ error: 'Failed to fetch Pokémon details' });
  }
});

// GET /api/pokemon/:id/species — species info
router.get('/:id/species', async (req, res) => {
  try {
    const species = await cachedFetch(`${POKEAPI}/pokemon-species/${req.params.id}`);
    const flavorEntry = species.flavor_text_entries.find(e => e.language.name === 'en');
    const genusEntry = species.genera.find(g => g.language.name === 'en');

    res.json({
      id: species.id,
      name: species.name,
      color: species.color?.name,
      habitat: species.habitat?.name,
      generation: species.generation?.name,
      flavor_text: flavorEntry?.flavor_text?.replace(/\f/g, ' ') || '',
      genus: genusEntry?.genus || '',
      is_legendary: species.is_legendary,
      is_mythical: species.is_mythical,
      evolution_chain_url: species.evolution_chain?.url
    });
  } catch (err) {
    console.error('Species error:', err);
    res.status(500).json({ error: 'Failed to fetch species info' });
  }
});

// GET /api/pokemon/:id/evolution — evolution chain
router.get('/:id/evolution', async (req, res) => {
  try {
    const species = await cachedFetch(`${POKEAPI}/pokemon-species/${req.params.id}`);
    if (!species.evolution_chain?.url) {
      return res.json({ chain: [] });
    }

    const evoData = await cachedFetch(species.evolution_chain.url);

    function flattenChain(node) {
      const result = [];
      const urlParts = node.species.url.split('/');
      const speciesId = parseInt(urlParts[urlParts.length - 2]);
      result.push({
        species_id: speciesId,
        name: node.species.name,
        min_level: node.evolution_details?.[0]?.min_level || null,
        trigger: node.evolution_details?.[0]?.trigger?.name || null,
        item: node.evolution_details?.[0]?.item?.name || null
      });
      for (const child of node.evolves_to) {
        result.push(...flattenChain(child));
      }
      return result;
    }

    const chain = flattenChain(evoData.chain);

    // Fetch sprites for each
    const chainWithSprites = await Promise.all(
      chain.map(async (entry) => {
        try {
          const poke = await cachedFetch(`${POKEAPI}/pokemon/${entry.species_id}`);
          return {
            ...entry,
            sprite: poke.sprites.other?.['official-artwork']?.front_default || poke.sprites.front_default
          };
        } catch {
          return { ...entry, sprite: null };
        }
      })
    );

    res.json({ chain: chainWithSprites });
  } catch (err) {
    console.error('Evolution error:', err);
    res.status(500).json({ error: 'Failed to fetch evolution chain' });
  }
});

module.exports = router;
