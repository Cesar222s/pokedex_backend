# Pokédex Backend — BFF (Backend For Frontend)

A Node.js/Express BFF that proxies the [PokéAPI](https://pokeapi.co/), handles user authentication, and manages persistent data (favorites, teams, friends, battles) with SQLite.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express 5
- **Database**: SQLite via `better-sqlite3`
- **Auth**: JWT (`jsonwebtoken`) + bcrypt
- **HTTP Client**: `node-fetch`
- **Environment**: `dotenv`

## Setup

```bash
# Install dependencies
npm install

# Create .env file (already provided)
# PORT=3000
# JWT_SECRET=pokesecret_change_me_in_production_2024
# POKEAPI_BASE_URL=https://pokeapi.co/api/v2
# DB_PATH=./data/pokedex.db

# Run in development mode
npm run dev

# Run in production
npm start
```

## Project Structure

```
src/
├── index.js              # Express app entry point
├── db.js                 # SQLite database setup & migrations
├── middleware/
│   └── auth.js           # JWT verification middleware
├── routes/
│   ├── auth.js           # Register, Login, Me
│   ├── pokemon.js        # PokéAPI proxy (list, detail, species, evolution)
│   ├── favorites.js      # User favorites CRUD
│   ├── teams.js          # Teams & members CRUD
│   ├── friends.js        # Friend system (add by code, accept, remove)
│   └── battles.js        # Battle system (start, history, details)
└── utils/
    ├── battleEngine.js   # Turn-based battle simulation
    └── typeChart.js      # 18-type effectiveness matrix
```

## API Endpoints

### Auth
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register (email, password, username) | No |
| POST | `/api/auth/login` | Login (email, password) | No |
| GET | `/api/auth/me` | Current user profile | Yes |

### Pokémon (PokéAPI Proxy)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/pokemon` | List with filters (name, type1, type2, region) | No |
| GET | `/api/pokemon/types` | List all types | No |
| GET | `/api/pokemon/regions` | List all regions | No |
| GET | `/api/pokemon/:id` | Pokémon details (stats, abilities, moves) | No |
| GET | `/api/pokemon/:id/species` | Species info (flavor text, habitat) | No |
| GET | `/api/pokemon/:id/evolution` | Evolution chain with sprites | No |

### Favorites
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/favorites` | List user's favorites | Yes |
| POST | `/api/favorites` | Add favorite (pokemon_id) | Yes |
| DELETE | `/api/favorites/:pokemonId` | Remove favorite | Yes |

### Teams
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/teams` | List teams with members | Yes |
| POST | `/api/teams` | Create team (name) | Yes |
| PUT | `/api/teams/:id` | Update team name | Yes |
| DELETE | `/api/teams/:id` | Delete team | Yes |
| POST | `/api/teams/:id/members` | Add member (max 6) | Yes |
| DELETE | `/api/teams/:id/members/:pokemonId` | Remove member | Yes |

### Friends
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/friends/add` | Send request by friend_code | Yes |
| GET | `/api/friends` | List accepted friends | Yes |
| GET | `/api/friends/pending` | List pending requests | Yes |
| POST | `/api/friends/:id/accept` | Accept request | Yes |
| DELETE | `/api/friends/:id` | Remove friend | Yes |

### Battles
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/battles` | Start battle (teams + opponent) | Yes |
| GET | `/api/battles` | Battle history | Yes |
| GET | `/api/battles/:id` | Battle details with log | Yes |

## Database Schema

- **users** — id, email, username, password_hash, friend_code, created_at
- **favorites** — id, user_id, pokemon_id, created_at
- **teams** — id, user_id, name, created_at
- **team_members** — id, team_id, pokemon_id, slot (1-6)
- **friends** — id, user_id, friend_id, status (pending/accepted)
- **battles** — id, challenger_id, opponent_id, teams, winner_id, log (JSON)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | — | Secret key for JWT signing |
| `POKEAPI_BASE_URL` | `https://pokeapi.co/api/v2` | PokéAPI base URL |
| `DB_PATH` | `./data/pokedex.db` | SQLite database file path |
