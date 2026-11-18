/** A real import, captured once so the landing page can show it instantly.
 *  Regenerate with: bun scripts/capture-proof.ts https://books.toscrape.com/
 *  Captured 2026-11-16: 6 pages, 59 items.
 *  Nothing here is hand-written — it is the importer's own output. */
import type { ImportedSite } from './importer'
import { buildSpec, type AppSpec, type SiteInfo } from './pricing'

export type SampleImport = {
  source: string
  host: string
  pages: number
  capturedAt: string
  site: ImportedSite
  found: string[]
  missing: string[]
}

export const SAMPLE_IMPORT: SampleImport = {
  "source": "https://books.toscrape.com/",
  "host": "books.toscrape.com",
  "pages": 6,
  "capturedAt": "2026-11-16",
  "site": {
    "name": "Books to Scrape",
    "tagline": "",
    "story": "",
    "vertical": "shop",
    "verticalConfidence": "detected",
    "category": "Bookshop",
    "categoryBasis": "the words on the page",
    "accent": "#428bca",
    "logo": "",
    "phone": "",
    "email": "",
    "address": "",
    "hours": "",
    "website": "https://books.toscrape.com",
    "currency": "GBP",
    "socials": [],
    "menu": [
      {
        "name": "Shop",
        "items": [
          {
            "name": "A Light in the Attic",
            "desc": "",
            "price": 5177
          },
          {
            "name": "Tipping the Velvet",
            "desc": "",
            "price": 5374
          },
          {
            "name": "Soumission",
            "desc": "",
            "price": 5010
          },
          {
            "name": "Sharp Objects",
            "desc": "",
            "price": 4782
          },
          {
            "name": "Sapiens: A Brief History of Humankind",
            "desc": "",
            "price": 5423
          },
          {
            "name": "The Requiem Red",
            "desc": "",
            "price": 2265
          },
          {
            "name": "The Dirty Little Secrets of Getting Your Dream Job",
            "desc": "",
            "price": 3334
          },
          {
            "name": "The Coming Woman: A Novel Based on the Life of the Infamous…",
            "desc": "",
            "price": 1793
          },
          {
            "name": "The Boys in the ...",
            "desc": "",
            "price": 2260
          },
          {
            "name": "The Black Maria",
            "desc": "",
            "price": 5215
          },
          {
            "name": "Starving Hearts (Triangular Trade Trilogy, #1)",
            "desc": "",
            "price": 1399
          },
          {
            "name": "Shakespeare's Sonnets",
            "desc": "",
            "price": 2066
          },
          {
            "name": "Set Me Free",
            "desc": "",
            "price": 1746
          },
          {
            "name": "Scott Pilgrim's Precious Little Life (Scott Pilgrim #1)",
            "desc": "",
            "price": 5229
          },
          {
            "name": "Rip it Up and Start Again",
            "desc": "",
            "price": 3502
          },
          {
            "name": "Our Band Could Be Your Life: Scenes from the American Indie…",
            "desc": "",
            "price": 5725
          },
          {
            "name": "Olio",
            "desc": "",
            "price": 2388
          },
          {
            "name": "Mesaerion: The Best Science Fiction Stories 1800-1849",
            "desc": "",
            "price": 3759
          },
          {
            "name": "Libertarianism for Beginners",
            "desc": "",
            "price": 5133
          },
          {
            "name": "It's Only the Himalayas",
            "desc": "",
            "price": 4517
          }
        ]
      },
      {
        "name": "Art",
        "items": [
          {
            "name": "Wall and Piece",
            "desc": "",
            "price": 4418
          },
          {
            "name": "Feathers: Displays of Brilliant Plumage",
            "desc": "",
            "price": 4905
          },
          {
            "name": "Art and Fear: Observations on the Perils (and Rewards) of…",
            "desc": "",
            "price": 4863
          },
          {
            "name": "The New Drawing on the Right Side of the Brain",
            "desc": "",
            "price": 4302
          },
          {
            "name": "History of Beauty",
            "desc": "",
            "price": 1029
          },
          {
            "name": "The Story of Art",
            "desc": "",
            "price": 4114
          },
          {
            "name": "The Art Book",
            "desc": "",
            "price": 3234
          },
          {
            "name": "Ways of Seeing",
            "desc": "",
            "price": 3951
          }
        ]
      },
      {
        "name": "Travel",
        "items": [
          {
            "name": "Full Moon over Noah’s Ark: An Odyssey to Mount Ararat and…",
            "desc": "",
            "price": 4943
          },
          {
            "name": "See America: A Celebration of Our National Parks &…",
            "desc": "",
            "price": 4887
          },
          {
            "name": "Vagabonding: An Uncommon Guide to the Art of Long-Term…",
            "desc": "",
            "price": 3694
          },
          {
            "name": "Under the Tuscan Sun",
            "desc": "",
            "price": 3733
          },
          {
            "name": "A Summer In Europe",
            "desc": "",
            "price": 4434
          },
          {
            "name": "The Great Railway Bazaar",
            "desc": "",
            "price": 3054
          },
          {
            "name": "A Year in Provence (Provence #1)",
            "desc": "",
            "price": 5688
          },
          {
            "name": "The Road to Little ...",
            "desc": "",
            "price": 2321
          },
          {
            "name": "Neither Here nor There: Travels in Europe",
            "desc": "",
            "price": 3895
          },
          {
            "name": "1,000 Places to See Before You Die",
            "desc": "",
            "price": 2608
          }
        ]
      },
      {
        "name": "Music",
        "items": [
          {
            "name": "How Music Works",
            "desc": "",
            "price": 3732
          },
          {
            "name": "Love Is a Mix Tape (Music #1)",
            "desc": "",
            "price": 1803
          },
          {
            "name": "Please Kill Me: The Uncensored Oral History of Punk",
            "desc": "",
            "price": 3119
          },
          {
            "name": "Kill 'Em and Leave: Searching for James Brown and the…",
            "desc": "",
            "price": 4505
          },
          {
            "name": "Chronicles, Vol. 1",
            "desc": "",
            "price": 5260
          },
          {
            "name": "This Is Your Brain on Music: The Science of a Human…",
            "desc": "",
            "price": 3840
          },
          {
            "name": "Orchestra of Exiles: The ...",
            "desc": "",
            "price": 1236
          },
          {
            "name": "No One Here Gets Out Alive",
            "desc": "",
            "price": 2002
          },
          {
            "name": "Life",
            "desc": "",
            "price": 3158
          },
          {
            "name": "Old Records Never Die: One Man's Quest for His Vinyl and…",
            "desc": "",
            "price": 5566
          },
          {
            "name": "Forever Rockers (The Rocker #12)",
            "desc": "",
            "price": 2880
          }
        ]
      },
      {
        "name": "Humor",
        "items": [
          {
            "name": "The Long Haul (Diary of a Wimpy Kid #9)",
            "desc": "",
            "price": 4407
          },
          {
            "name": "Old School (Diary of a Wimpy Kid #10)",
            "desc": "",
            "price": 1183
          },
          {
            "name": "I Know What I'm ...",
            "desc": "",
            "price": 2598
          },
          {
            "name": "Hyperbole and a Half: ...",
            "desc": "",
            "price": 1475
          },
          {
            "name": "Dress Your Family in Corduroy and Denim",
            "desc": "",
            "price": 4368
          },
          {
            "name": "Toddlers Are A**holes: It's Not Your Fault",
            "desc": "",
            "price": 2555
          },
          {
            "name": "When You Are Engulfed in Flames",
            "desc": "",
            "price": 3089
          },
          {
            "name": "Naked",
            "desc": "",
            "price": 3169
          },
          {
            "name": "Lamb: The Gospel According to Biff, Christ's Childhood Pal",
            "desc": "",
            "price": 5550
          },
          {
            "name": "Holidays on Ice",
            "desc": "",
            "price": 5107
          }
        ]
      }
    ],
    "features": [
      "catalog",
      "ordering"
    ]
  },
  "found": [
    "59 catalogue entries in 5 sections, read from 6 pages",
    "name: Books to Scrape",
    "category: Bookshop — from the words on the page",
    "brand colour #428bca"
  ],
  "missing": [
    "phone number",
    "email",
    "address",
    "opening hours"
  ]
}

/** The app built from that read, with no edits. */
export function sampleSpec(): AppSpec {
  const { site } = SAMPLE_IMPORT
  const details: SiteInfo = {
    menu: site.menu,
    category: site.category,
    story: site.story,
    hours: site.hours,
    phone: site.phone,
    address: site.address,
    email: site.email,
    website: site.website,
    currency: site.currency,
    socials: site.socials,
  }
  return buildSpec({
    name: site.name,
    vertical: site.vertical,
    accent: site.accent,
    logo: 'BT',
    features: site.features,
    tagline: site.tagline,
    site: details,
  })
}

export function sampleTotals(): { items: number; sections: number; priced: number } {
  const items = SAMPLE_IMPORT.site.menu.flatMap((section) => section.items)
  return {
    items: items.length,
    sections: SAMPLE_IMPORT.site.menu.length,
    priced: items.filter((item) => item.price > 0).length,
  }
}
