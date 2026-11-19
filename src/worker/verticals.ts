import type { FeatureId, MenuSection, VerticalId, Vocab } from './types'

/**
 * What kind of business is this? Each entry carries the words, the seeded
 * content and the features that make sense — so "build whatever the customer
 * asks for" starts from a plausible app of the right shape, and anything
 * outside the catalogue goes in the brief's free-text field.
 */

export type Vertical = {
  id: VerticalId
  label: string
  blurb: string
  glyph: string
  kind: string
  tagline: string
  story: string
  hours: string
  phone: string
  address: string
  accent: string
  features: FeatureId[]
  vocab: Vocab
  menu: MenuSection[]
  offers: { title: string; body: string }[]
  loyalty: { goal: number; reward: string }
  /** Named people a booking can be made with; sample names, not a claim. */
  staff?: string[]
  /** Team profiles for expertise-led trades; always sample copy. */
  team?: { name: string; role: string; credential?: string }[]
  timetable?: { name: string; when: string; coach: string }[]
  /** What the trade has on, shown when the events feature is picked. */
  events?: { title: string; when: string }[]
}

const BASE_PHONE = '+1 555 01'

export const VERTICALS: Record<VerticalId, Vertical> = {
  restaurant: {
    id: 'restaurant',
    label: 'Restaurant',
    blurb: 'Menu, orders, table bookings',
    glyph: '🍽',
    kind: 'Seasonal neighbourhood restaurant',
    tagline: 'Seasonal plates, cooked to order.',
    story:
      'A forty-seat room, one short menu and a kitchen that changes it whenever the market does.',
    hours: 'Tue–Sun 17:00–23:00',
    phone: `${BASE_PHONE}42`,
    address: '8 Furnace Yard, Old Town',
    accent: '#c8452b',
    features: ['catalog', 'ordering', 'booking', 'loyalty', 'offers', 'reviews', 'gallery'],
    vocab: {
      catalog: 'Menu',
      item: 'dish',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a table',
      quoteTitle: 'Ask us anything',
      partyLabel: 'Party size',
      fulfilment: ['Pickup', 'Delivery', 'At a table'],
      homeCta: 'Order now',
      slots: ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'],
    },
    menu: [
      {
        name: 'Starters',
        items: [
          { name: 'Burrata, heirloom tomatoes', desc: 'Basil, olive oil', price: 1200 },
          { name: 'Warm sourdough', desc: 'Cultured butter, sea salt', price: 600 },
        ],
      },
      {
        name: 'Mains',
        items: [
          { name: 'Sea bass', desc: 'Fennel, brown butter', price: 2400, tag: 'Popular' },
          { name: 'Lamb ragu', desc: 'Pappardelle, pecorino', price: 2100 },
          { name: 'Mushroom risotto', desc: 'Aged parmesan', price: 1800, tag: 'Veg' },
        ],
      },
      {
        name: 'Puddings & drinks',
        items: [
          { name: 'Tiramisu', desc: 'Made each morning', price: 800 },
          { name: 'House spritz', desc: 'Aperitivo, olive', price: 900 },
        ],
      },
    ],
    offers: [
      { title: 'Two courses, $24', body: 'Midweek lunch, Tuesday to Thursday until 3pm.' },
      { title: 'Counter seats', body: 'Walk-ins only, from 6pm.' },
    ],
    loyalty: { goal: 6, reward: 'A main on the house' },
  },

  cafe: {
    id: 'cafe',
    label: 'Café & bakery',
    blurb: 'Coffee, pastry, quick pickup',
    glyph: '☕',
    kind: 'Coffee bar and bakery',
    tagline: 'Slow mornings, fast coffee.',
    story:
      'One grinder, a rotating filter list, and a bakehouse that finishes before the sun is up.',
    hours: 'Mon–Fri 7:00–16:00 · Sat–Sun 8:00–17:00',
    phone: `${BASE_PHONE}98`,
    address: '14 Mill Lane, Riverside',
    accent: '#8a5a2b',
    features: ['catalog', 'ordering', 'booking', 'loyalty', 'offers', 'reviews'],
    vocab: {
      catalog: 'Menu',
      item: 'item',
      order: 'Order',
      book: 'Reserve',
      bookTitle: 'Reserve a table',
      quoteTitle: 'Ask us anything',
      partyLabel: 'Guests',
      fulfilment: ['Pickup', 'Delivery'],
      homeCta: 'Order for pickup',
      slots: ['08:30', '09:30', '10:30', '12:00', '13:00', '14:30', '16:00'],
    },
    menu: [
      {
        name: 'Coffee',
        items: [
          { name: 'Flat white', desc: 'House blend, 6oz', price: 420 },
          { name: 'Filter of the week', desc: 'Rotating single origin', price: 360, tag: 'New' },
          { name: 'Cold brew', desc: '18-hour steep, over ice', price: 480 },
        ],
      },
      {
        name: 'Bakery',
        items: [
          { name: 'Croissant', desc: 'Laminated over three days', price: 380 },
          { name: 'Cardamom bun', desc: 'Baked at 5am', price: 450 },
        ],
      },
      {
        name: 'All day',
        items: [
          { name: 'Granola bowl', desc: 'Yoghurt, honey, poached pear', price: 800 },
          { name: 'Eggs on rye', desc: 'Chilli oil, herbs', price: 1200, tag: 'Popular' },
        ],
      },
    ],
    offers: [
      { title: 'Filter + bun, $7', body: 'Weekdays before 10am.' },
      { title: 'Bring your own cup', body: '50c off every hot drink, all day.' },
    ],
    loyalty: { goal: 8, reward: 'A free coffee' },
  },

  shop: {
    id: 'shop',
    label: 'Shop & retail',
    blurb: 'Catalogue, cart, pickup',
    glyph: '🛍',
    kind: 'Independent homeware shop',
    tagline: 'Things worth keeping.',
    story:
      'A small shop of makers we know by name: stoneware from a two-person studio, linen woven a county over.',
    hours: 'Tue–Sat 10:00–18:00',
    phone: `${BASE_PHONE}63`,
    address: '3 Lantern Court, East Side',
    accent: '#2a5a8f',
    features: ['catalog', 'ordering', 'delivery', 'loyalty', 'offers', 'gallery', 'reviews'],
    vocab: {
      catalog: 'Shop',
      item: 'piece',
      order: 'Bag',
      book: 'Book',
      bookTitle: 'Visit the shop',
      quoteTitle: 'Ask about a piece',
      partyLabel: 'People',
      fulfilment: ['Pickup', 'Delivery'],
      homeCta: 'Shop the collection',
      slots: [],
    },
    menu: [
      {
        name: 'Ceramics',
        items: [
          { name: 'Stoneware mug', desc: 'Speckled glaze, 300ml', price: 2800, tag: 'Bestseller' },
          { name: 'Serving bowl', desc: 'Hand-thrown, 28cm', price: 4600 },
          { name: 'Bud vase', desc: 'Matte ash glaze', price: 3200 },
        ],
      },
      {
        name: 'Textiles',
        items: [
          { name: 'Linen throw', desc: 'Stonewashed, 130×180cm', price: 12000 },
          { name: 'Cushion cover', desc: 'Woad-dyed linen', price: 4800 },
        ],
      },
      {
        name: 'Furniture',
        items: [
          { name: 'Sculptural chair', desc: 'Solid ash, pale finish', price: 24000 },
          { name: 'Oak stool', desc: 'Hand-turned, 45cm', price: 9500, tag: 'Limited' },
        ],
      },
    ],
    offers: [
      { title: 'Local delivery, $2.99', body: 'Within five miles, next day.' },
      { title: 'First look: new ceramics', body: 'Friday evening, in the shop.' },
    ],
    loyalty: { goal: 5, reward: '10% off your next order' },
  },

  salon: {
    id: 'salon',
    label: 'Salon & spa',
    blurb: 'Treatments, durations, appointments',
    glyph: '💅',
    kind: 'Hair and beauty salon',
    tagline: 'Time that belongs to you.',
    story:
      'Four chairs, two treatment rooms and a rule that nothing runs late. Everyone here is booked by name.',
    hours: 'Tue–Sat 9:00–19:00',
    phone: `${BASE_PHONE}77`,
    address: '22 Orchard Row, High Street',
    accent: '#7a4b8f',
    features: ['catalog', 'booking', 'quote', 'loyalty', 'offers', 'gallery', 'reviews'],
    vocab: {
      catalog: 'Services',
      item: 'treatment',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book an appointment',
      quoteTitle: 'Ask about a treatment',
      partyLabel: 'People',
      fulfilment: ['In salon'],
      homeCta: 'Book an appointment',
      slots: ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'],
    },
    menu: [
      {
        name: 'Hair',
        items: [
          { name: 'Cut & finish', desc: 'Consultation, wash, cut, style', price: 5500, meta: '45 min' },
          { name: 'Colour', desc: 'Full head, toner included', price: 12000, meta: '2 hr', tag: 'Popular' },
          { name: 'Blow dry', desc: 'Wash and finish', price: 3800, meta: '30 min' },
        ],
      },
      {
        name: 'Treatments',
        items: [
          { name: 'Keratin smoothing', desc: 'Lasts 12 weeks', price: 14000, meta: '2 hr 30' },
          { name: 'Scalp ritual', desc: 'Massage, mask, steam', price: 4500, meta: '40 min' },
        ],
      },
      {
        name: 'Beauty',
        items: [
          { name: 'Brow shape', desc: 'Wax and tint', price: 2500, meta: '20 min' },
          { name: 'Gel manicure', desc: 'Shape, buff, long-wear colour', price: 4200, meta: '45 min' },
        ],
      },
    ],
    offers: [
      { title: 'Tuesday colour, 15% off', body: 'Any full-head colour, all day Tuesday.' },
      { title: 'Refer a friend', body: 'You both get $20 off the next visit.' },
    ],
    staff: ['Maya Chen', 'Noa Williams', 'Elena Rossi'],
    loyalty: { goal: 6, reward: 'A free blow dry' },
  },

  gym: {
    id: 'gym',
    label: 'Gym & studio',
    blurb: 'Memberships, timetable, class booking',
    glyph: '🏋',
    kind: 'Strength and conditioning gym',
    tagline: 'Coaching, not guesswork.',
    story:
      'Small groups, a coach who knows your name, and a programme written for you rather than for the mirror.',
    hours: 'Mon–Fri 6:00–21:00 · Sat 8:00–14:00',
    phone: `${BASE_PHONE}21`,
    address: 'Unit 4, Gasworks Lane',
    accent: '#1f6b52',
    features: ['catalog', 'classes', 'booking', 'quote', 'loyalty', 'offers', 'reviews'],
    vocab: {
      catalog: 'Memberships',
      item: 'plan',
      order: 'Order',
      book: 'Classes',
      bookTitle: 'Join a class',
      quoteTitle: 'Membership enquiry',
      quoteNote: 'Tell us your goal and any experience you have. No medical history needed.',
      partyLabel: 'Spots',
      fulfilment: ['In studio'],
      homeCta: 'See the timetable',
      slots: ['06:30', '07:30', '12:00', '17:30', '18:30'],
    },
    menu: [
      {
        name: 'Memberships',
        items: [
          { name: 'Unlimited monthly', desc: 'All classes, no contract', price: 8900, meta: 'per month', tag: 'Popular' },
          { name: 'Class pack ×10', desc: 'Valid six months', price: 12000 },
          { name: 'Drop-in class', desc: 'Pay as you go', price: 1500 },
        ],
      },
      {
        name: 'Coaching',
        items: [
          { name: '1:1 session', desc: 'With a strength coach', price: 6000, meta: '60 min' },
          { name: 'Movement screen', desc: 'Assessment and plan', price: 4500, meta: '45 min' },
        ],
      },
      {
        name: 'Classes',
        items: [
          { name: 'Strength 101', desc: 'Barbell basics in a small group', price: 1500, meta: 'Mon · Wed · Fri 06:30' },
          { name: 'Barbell club', desc: 'Coached lifting, all levels', price: 1500, meta: 'Tue · Thu 18:30' },
          { name: 'Conditioning', desc: 'Engine work, no burpees', price: 1500, meta: 'Sat 09:00' },
        ],
      },
    ],
    offers: [
      { title: 'First class free', body: 'Any class, any level. Just book a spot.' },
      { title: 'Bring a friend Fridays', body: 'Second person trains free.' },
    ],
    loyalty: { goal: 10, reward: 'A guest pass for a friend' },
    staff: ['Ada Okafor', 'Marcus Bell', 'Priya Shah'],
    team: [
      { name: 'Ada Okafor', role: 'Head coach', credential: 'Strength & conditioning' },
      { name: 'Marcus Bell', role: 'Barbell coach', credential: 'Level 3' },
      { name: 'Priya Shah', role: 'Conditioning coach', credential: 'Endurance' },
    ],
    timetable: [
      { name: 'Strength 101', when: 'Mon · Wed · Fri 06:30', coach: 'with Ada' },
      { name: 'Barbell club', when: 'Tue · Thu 18:30', coach: 'with Marcus' },
      { name: 'Conditioning', when: 'Sat 09:00', coach: 'with Priya' },
    ],
  },

  clinic: {
    id: 'clinic',
    label: 'Clinic & health',
    blurb: 'Treatments, appointments, patient info',
    glyph: '🩺',
    kind: 'Dental and health clinic',
    tagline: 'Careful hands, clear pricing.',
    story:
      'A calm practice with two surgeries, a hygienist and a policy of quoting before anything begins.',
    hours: 'Mon–Fri 8:00–18:00',
    phone: `${BASE_PHONE}35`,
    address: '9 Wellfield Road, Northside',
    accent: '#2a5a8f',
    features: ['catalog', 'booking', 'quote', 'reviews', 'gallery'],
    vocab: {
      catalog: 'Treatments',
      item: 'treatment',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book an appointment',
      quoteTitle: 'Patient enquiry',
      quoteNote: 'Please do not include medical details. We only need your contact details to arrange an appointment; a clinician will discuss your health privately.',
      partyLabel: 'Patients',
      fulfilment: ['At the clinic'],
      homeCta: 'Book an appointment',
      slots: ['08:30', '10:00', '11:30', '14:00', '15:30', '17:00'],
      galleryTitle: 'The practice',
    },
    menu: [
      {
        name: 'Check-ups',
        items: [
          { name: 'New patient exam', desc: 'Includes x-rays', price: 6500, meta: '40 min', tag: 'Start here' },
          { name: 'Hygiene visit', desc: 'Scale and polish', price: 9000, meta: '30 min' },
        ],
      },
      {
        name: 'Restorative',
        items: [
          { name: 'Composite filling', desc: 'Tooth-coloured', price: 14500, meta: '45 min' },
          { name: 'Crown', desc: 'Porcelain, two visits', price: 69000 },
        ],
      },
      {
        name: 'Cosmetic',
        items: [
          { name: 'Whitening', desc: 'In-chair, one visit', price: 32000, meta: '90 min' },
          { name: 'Clear aligners', desc: 'Full case, quoted after scan', price: 0, meta: 'from $2,400' },
        ],
      },
    ],
    offers: [
      { title: 'New patient exam $55', body: 'Includes x-rays. First visit only.' },
      { title: 'Evening slots', body: 'Until 8pm on Wednesdays.' },
    ],
    loyalty: { goal: 2, reward: 'A free hygiene visit after two check-ups' },
    staff: ['Dr Amara Osei', 'Dr Theo Marsh', 'Lena Park'],
    team: [
      { name: 'Dr Amara Osei', role: 'Principal dentist', credential: 'GDC 84210' },
      { name: 'Dr Theo Marsh', role: 'Dentist', credential: 'GDC 90117' },
      { name: 'Lena Park', role: 'Hygienist', credential: 'GDC 76542' },
    ],
  },

  trades: {
    id: 'trades',
    label: 'Trades & home services',
    blurb: 'Services, quote requests, call-outs',
    glyph: '🔧',
    kind: 'Plumbing and heating',
    tagline: 'Turn up, fix it, clean up.',
    story:
      'One van, two engineers and a promise to tell you the price before the spanner comes out.',
    hours: 'Mon–Sat 7:30–18:00 · Emergency 24h',
    phone: `${BASE_PHONE}09`,
    address: 'Covering the whole city',
    accent: '#a8741a',
    features: ['catalog', 'quote', 'booking', 'reviews', 'gallery', 'offers'],
    vocab: {
      catalog: 'Services',
      item: 'job',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a call-out',
      quoteTitle: 'Request a quote',
      quoteNote: 'A photo and a sentence about what has gone wrong is enough. We reply with a fixed price, usually within one working day.',
      partyLabel: 'People',
      fulfilment: ['At your place'],
      homeCta: 'Get a quote',
      slots: ['08:00', '10:00', '12:00', '14:00', '16:00'],
    },
    menu: [
      {
        name: 'Plumbing',
        items: [
          { name: 'Leak repair', desc: 'Same day where possible', price: 0, meta: 'from $120' },
          { name: 'Bathroom refit', desc: 'Full install, four days', price: 0, meta: 'from $3,800' },
        ],
      },
      {
        name: 'Heating',
        items: [
          { name: 'Boiler service', desc: 'Certificate included', price: 9500, meta: '1 hr' },
          { name: 'New boiler', desc: 'Supply and fit', price: 0, meta: 'from $2,900' },
        ],
      },
      {
        name: 'Emergency',
        items: [
          { name: 'Out-of-hours call-out', desc: 'Within two hours', price: 15000, meta: 'first hour' },
        ],
      },
    ],
    offers: [
      { title: 'Free quote in 24 hours', body: 'Send a photo, get a price the next day.' },
      { title: 'Landlord certificates', body: 'Booked this week, certificate by email.' },
    ],
    loyalty: { goal: 3, reward: 'A free annual boiler check' },
    staff: ['Dan Mercer', 'Ruth Okafor'],
    team: [
      { name: 'Dan Mercer', role: 'Heating engineer', credential: 'Gas Safe 552103' },
      { name: 'Ruth Okafor', role: 'Plumbing lead', credential: 'City & Guilds' },
    ],
  },

  professional: {
    id: 'professional',
    label: 'Professional services',
    blurb: 'Services, proposals, consultations',
    glyph: '📐',
    kind: 'Accounting and tax advisory',
    tagline: 'Clean books, no surprises.',
    story:
      'A three-person practice for owner-managed businesses: fixed fees, plain English, and a phone that gets answered.',
    hours: 'Mon–Fri 9:00–18:00',
    phone: `${BASE_PHONE}56`,
    address: 'Second floor, 12 Corn Exchange',
    accent: '#17110d',
    features: ['catalog', 'quote', 'booking', 'reviews'],
    vocab: {
      catalog: 'Services',
      item: 'service',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book an intro call',
      quoteTitle: 'Request a proposal',
      partyLabel: 'Attendees',
      fulfilment: ['Online'],
      homeCta: 'Request a proposal',
      slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
    },
    menu: [
      {
        name: 'Compliance',
        items: [
          { name: 'Annual accounts', desc: 'Limited company, filed', price: 95000, meta: 'per year' },
          { name: 'Self assessment', desc: 'One director, one property', price: 32000 },
          { name: 'Payroll', desc: 'Up to ten staff', price: 4500, meta: 'per month' },
        ],
      },
      {
        name: 'Advisory',
        items: [
          { name: 'Business plan', desc: 'Forecasts and funding pack', price: 120000 },
          { name: 'Quarterly review', desc: 'Two hours with a partner', price: 60000 },
        ],
      },
    ],
    offers: [
      { title: 'Free 20-minute intro call', body: 'No pitch, just questions answered.' },
      { title: 'Fixed-fee self assessment', body: 'Quoted before we start.' },
    ],
    staff: ['Maya Chen', 'Alex Reed', 'Priya Shah'],
    team: [
      { name: 'Maya Chen', role: 'Managing partner', credential: 'FCA' },
      { name: 'Alex Reed', role: 'Tax adviser', credential: 'ATT' },
    ],
    loyalty: { goal: 2, reward: 'A free quarterly review' },
  },

  property: {
    id: 'property',
    label: 'Property & estate agency',
    blurb: 'Listings, viewings, valuations',
    glyph: '🏠',
    kind: 'Independent estate agency',
    tagline: 'Homes with a story.',
    story:
      'A two-branch agency that still measures rooms by hand and writes its own listings.',
    hours: 'Mon–Sat 9:00–18:00',
    phone: `${BASE_PHONE}18`,
    address: '41 Kestrel Square, Gardens',
    accent: '#5b3f8f',
    features: ['catalog', 'quote', 'booking', 'gallery', 'reviews', 'offers'],
    vocab: {
      catalog: 'Listings',
      item: 'home',
      order: 'Order',
      book: 'Viewing',
      bookTitle: 'Book a viewing',
      quoteTitle: 'Request a valuation',
      quoteNote: 'Tell us the address and what you are thinking of doing. We will arrange a measured valuation.',
      partyLabel: 'Viewers',
      fulfilment: ['At the property'],
      homeCta: 'Request a valuation',
      slots: ['10:00', '11:30', '13:00', '15:00', '17:00'],
      galleryTitle: 'Inside the homes',
    },
    menu: [
      {
        name: 'For sale',
        items: [
          { name: 'Kestrel Square', desc: 'South-facing garden, original floors', price: 68500000, meta: '3 bed · 2 bath · Gardens', tag: 'New' },
          { name: 'Mill Lane', desc: 'Top floor, river view', price: 42500000, meta: '2 bed · 1 bath · Riverside' },
        ],
      },
      {
        name: 'To rent',
        items: [
          { name: 'Lantern Court', desc: 'Furnished, bills included', price: 240000, meta: '2 bed · furnished · per month' },
          { name: 'Gasworks Loft', desc: 'Studio, exposed steel', price: 185000, meta: 'Studio · 1 bath · per month' },
        ],
      },
    ],
    offers: [
      { title: 'Free valuation this month', body: 'Twenty minutes, no obligation.' },
      { title: 'Saturday viewings', body: 'Book a slot from 10am.' },
    ],
    loyalty: { goal: 3, reward: 'A free floor plan on your next sale' },
  },

  hotel: {
    id: 'hotel',
    label: 'Hotel & guesthouse',
    blurb: 'Rooms, rates, availability',
    glyph: '🛏',
    kind: 'Small guesthouse',
    tagline: 'Six rooms, one long view.',
    story:
      'A converted coastguard house above the harbour. Breakfast is at one long table, whether you like it or not.',
    hours: 'Reception 7:00–22:00',
    phone: `${BASE_PHONE}31`,
    address: 'Harbour Head, North Cliff',
    accent: '#1f6b52',
    features: ['catalog', 'booking', 'quote', 'offers', 'gallery', 'reviews'],
    vocab: {
      catalog: 'Rooms',
      item: 'room',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Check availability',
      quoteTitle: 'Ask about a stay',
      partyLabel: 'Guests',
      fulfilment: ['At the guesthouse'],
      homeCta: 'Check availability',
      slots: [],
    },
    menu: [
      {
        name: 'Rooms',
        items: [
          { name: 'Garden double', desc: 'Ground floor, private door', price: 18000, meta: 'per night' },
          { name: 'Loft suite', desc: 'Sea view, roll-top bath', price: 26000, meta: 'per night', tag: 'Popular' },
          { name: 'Single', desc: 'Small, quiet, harbour side', price: 12000, meta: 'per night' },
        ],
      },
      {
        name: 'Extras',
        items: [
          { name: 'Breakfast', desc: 'One table, 8–10am', price: 1800, meta: 'per person' },
          { name: 'Late checkout', desc: 'Until 2pm', price: 3000 },
        ],
      },
    ],
    offers: [
      { title: 'Third night half price', body: 'Stay two, book a third for less.' },
      { title: 'Book direct', body: 'Breakfast included when you book here.' },
    ],
    loyalty: { goal: 3, reward: 'A free night on your third stay' },
  },

  studio: {
    id: 'studio',
    label: 'Creative studio',
    blurb: 'Portfolio, packages, enquiries',
    glyph: '📷',
    kind: 'Photography studio',
    tagline: 'Light, patience, timing.',
    story:
      'Two photographers, one studio with north light, and a lot of weddings in between.',
    hours: 'Mon–Fri 10:00–19:00',
    phone: `${BASE_PHONE}74`,
    address: 'Studio 6, Old Print Works',
    accent: '#17110d',
    features: ['catalog', 'quote', 'gallery', 'reviews', 'booking'],
    vocab: {
      catalog: 'Packages',
      item: 'package',
      order: 'Order',
      book: 'Call',
      bookTitle: 'Book a call',
      quoteTitle: 'Request a shoot brief',
      quoteNote: 'A few lines about the project, the dates and where it will happen is plenty.',
      partyLabel: 'People',
      fulfilment: ['On location'],
      homeCta: 'Request a shoot brief',
      slots: ['10:00', '11:30', '14:00', '15:30', '17:00'],
      galleryTitle: 'Selected work',
    },
    menu: [
      {
        name: 'Weddings',
        items: [
          { name: 'Full day', desc: 'Prep to first dance', price: 0, meta: 'from $3,200' },
          { name: 'Half day', desc: 'Ceremony and portraits', price: 0, meta: 'from $1,900' },
        ],
      },
      {
        name: 'Portraits',
        items: [
          { name: 'Studio session', desc: 'Two hours, ten edits', price: 38000, meta: '2 hr' },
          { name: 'Family session', desc: 'Outdoors, one hour', price: 45000, meta: '1 hr' },
        ],
      },
      {
        name: 'Commercial',
        items: [
          { name: 'Product day rate', desc: 'Studio, styling included', price: 120000, meta: 'per day' },
        ],
      },
    ],
    offers: [
      { title: 'Winter wedding dates', body: 'Two dates left before April.' },
      { title: 'Half-day studio hire', body: 'Weekday rate for members.' },
    ],
    loyalty: { goal: 2, reward: 'A free print from your next shoot' },
    team: [
      { name: 'Nell Fraser', role: 'Photographer', credential: 'Editorial & weddings' },
      { name: 'Ivo Mercer', role: 'Photographer', credential: 'Studio & product' },
    ],
  },

  auto: {
    id: 'auto',
    label: 'Garage & auto',
    blurb: 'Servicing, bookings, quotes',
    glyph: '🚗',
    kind: 'Independent garage',
    tagline: 'Fixed properly, explained plainly.',
    story:
      'Four bays, two lifts and a rule that nobody leaves without seeing the old part.',
    hours: 'Mon–Fri 8:00–18:00 · Sat 8:00–13:00',
    phone: `${BASE_PHONE}65`,
    address: 'Rear of 90 Dock Road',
    accent: '#2a5a8f',
    features: ['catalog', 'booking', 'quote', 'reviews', 'offers'],
    vocab: {
      catalog: 'Work',
      item: 'job',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a slot',
      quoteTitle: 'Get a quote',
      partyLabel: 'Vehicles',
      fulfilment: ['At the garage'],
      homeCta: 'Book a slot',
      slots: ['08:00', '09:30', '11:00', '13:30', '15:00', '16:30'],
    },
    menu: [
      {
        name: 'Servicing',
        items: [
          { name: 'Interim service', desc: 'Oil, filters, inspection', price: 14500, meta: '1 hr 30' },
          { name: 'Full service', desc: 'All fluids, plugs, brakes checked', price: 29000, meta: 'half day' },
          { name: 'MOT', desc: 'Class 4, test only', price: 5500, meta: '1 hr' },
        ],
      },
      {
        name: 'Repairs',
        items: [
          { name: 'Brake pads', desc: 'Front or rear, fitted', price: 18000 },
          { name: 'Clutch', desc: 'Most hatchbacks', price: 0, meta: 'from $650' },
          { name: 'Diagnostics', desc: 'Full fault scan', price: 6500, meta: '45 min' },
        ],
      },
    ],
    offers: [
      { title: 'Free brake check', body: 'With any service this month.' },
      { title: 'MOT + service, $310', body: 'Book both together.' },
    ],
    loyalty: { goal: 4, reward: 'A free MOT next year' },
    staff: ['Sam Iles', 'Priya Nair'],
    team: [
      { name: 'Sam Iles', role: 'Master technician', credential: 'IMI 44102' },
      { name: 'Priya Nair', role: 'Service adviser', credential: 'Customer care' },
    ],
  },

  hospital: {
    id: 'hospital',
    label: 'Hospital & health',
    blurb: 'Departments, clinics, visiting',
    glyph: '🏥',
    kind: 'Community hospital',
    tagline: 'Care close to home.',
    story:
      'A community hospital with an urgent treatment centre, two wards and clinics that mostly run to time.',
    hours: 'Visiting 14:00–20:00',
    phone: `${BASE_PHONE}08`,
    address: 'Brookfield Way, Northgate',
    accent: '#0f6b6b',
    features: ['catalog', 'booking', 'offers', 'reviews', 'quote'],
    vocab: {
      catalog: 'Departments',
      item: 'clinic',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a clinic',
      quoteTitle: 'Ask the hospital',
      partyLabel: 'Patients',
      fulfilment: ['At the hospital'],
      homeCta: 'Book a clinic',
      slots: ['08:30', '09:15', '10:00', '11:30', '14:00', '15:30'],
    },
    menu: [
      {
        name: 'Clinics',
        items: [
          { name: 'Outpatient clinic', desc: 'Referral or walk-in', price: 0, meta: 'by referral' },
          { name: 'Diagnostics', desc: 'Bloods, ECG, imaging', price: 0, meta: 'same day' },
          { name: 'Antenatal', desc: 'Midwife-led', price: 0, meta: 'weekly', tag: 'Popular' },
        ],
      },
      {
        name: 'Visiting & transport',
        items: [
          { name: 'Ward visiting', desc: 'Two until eight, daily', price: 0, meta: 'free' },
          { name: 'Patient transport', desc: 'Book two days ahead', price: 0, meta: 'free' },
        ],
      },
    ],
    offers: [
      { title: 'Walk-in flu clinic', body: 'Weekdays 8–11, no appointment needed.' },
      { title: 'Free visitor parking', body: 'First hour, both car parks.' },
    ],
    loyalty: { goal: 3, reward: 'Priority booking for your next clinic' },
  },

  ecommerce: {
    id: 'ecommerce',
    label: 'Online store',
    blurb: 'Catalogue, checkout, delivery',
    glyph: '🛒',
    kind: 'Independent online shop',
    tagline: 'Small batches, shipped daily.',
    story:
      'A two-person studio selling direct: everything made in runs of fifty, packed in the same room it is made in.',
    hours: 'Packed Mon–Fri, 9:00–17:00',
    phone: `${BASE_PHONE}19`,
    address: 'Unit 4, Fielding Estate',
    accent: '#b3391f',
    features: ['catalog', 'ordering', 'delivery', 'offers', 'reviews', 'loyalty'],
    vocab: {
      catalog: 'Shop',
      item: 'product',
      order: 'Bag',
      book: 'Book',
      bookTitle: 'Book a fitting',
      quoteTitle: 'Ask about an order',
      partyLabel: 'People',
      fulfilment: ['Delivery', 'Pickup'],
      homeCta: 'Shop new in',
      slots: [],
    },
    menu: [
      {
        name: 'New in',
        items: [
          { name: 'Everyday tote', desc: 'Waxed canvas, brass clips', price: 6800 },
          { name: 'Desk tray', desc: 'Oak offcuts, oiled', price: 4200, tag: 'Popular' },
          { name: 'Cotton throw', desc: 'Woven in small runs', price: 9400 },
        ],
      },
      {
        name: 'For the kitchen',
        items: [
          { name: 'Beech board', desc: 'End grain, 30cm', price: 5200 },
          { name: 'Linen apron', desc: 'Stone or rust', price: 3800 },
        ],
      },
      {
        name: 'Gifting',
        items: [
          { name: 'Gift card', desc: 'Sent by email', price: 5000 },
          { name: 'Workshop pair', desc: 'Two places, any date', price: 12000 },
        ],
      },
    ],
    offers: [
      { title: 'Delivery $2.99, tracked', body: 'Two to three working days.' },
      { title: 'Seconds sale', body: 'Slight marks, half price, this week.' },
    ],
    loyalty: { goal: 5, reward: '$15 off your next order' },
  },

  'plants-indoor': {
    id: 'plants-indoor',
    label: 'Indoor plant shop',
    blurb: 'Houseplants, pots, care',
    glyph: '🪴',
    kind: 'Houseplant shop',
    tagline: 'Green that tolerates a north window.',
    story:
      'A shop full of plants that survive real flats: low light, radiators, and a fortnight away in August.',
    hours: 'Tue–Sat 10:00–18:00 · Sun 11:00–16:00',
    phone: `${BASE_PHONE}23`,
    address: '3 Marlow Lane, Basement',
    accent: '#2f6b3a',
    features: ['catalog', 'ordering', 'offers', 'reviews', 'gallery'],
    vocab: {
      catalog: 'Plants',
      item: 'plant',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a repotting',
      quoteTitle: 'Ask about a plant',
      partyLabel: 'People',
      fulfilment: ['Pickup', 'Local delivery'],
      homeCta: 'Shop the plants',
      slots: [],
    },
    menu: [
      {
        name: 'Easy care',
        items: [
          { name: 'Snake plant', desc: 'Any corner, water monthly', price: 2400 },
          { name: 'ZZ plant', desc: 'Happy in low light', price: 3200, tag: 'Popular' },
          { name: 'Pothos', desc: 'Trailing, fast growing', price: 1600 },
        ],
      },
      {
        name: 'Statement',
        items: [
          { name: 'Fiddle-leaf fig', desc: '1.2m, bright room', price: 8400 },
          { name: 'Monstera', desc: 'Mature, four leaves', price: 5600 },
        ],
      },
      {
        name: 'Pots & soil',
        items: [
          { name: 'Terracotta pot', desc: '16cm, with saucer', price: 1200 },
          { name: 'Aroid mix', desc: '5 litres, bark and perlite', price: 900 },
        ],
      },
    ],
    offers: [
      { title: 'Pot up free', body: 'Bring your plant in, we will repot it.' },
      { title: 'Three plants, $55', body: 'Pick any three from easy care.' },
    ],
    loyalty: { goal: 4, reward: 'A plant on the house' },
  },

  'plants-outdoor': {
    id: 'plants-outdoor',
    label: 'Garden centre',
    blurb: 'Outdoor plants, trees, advice',
    glyph: '🌿',
    kind: 'Plant nursery and garden centre',
    tagline: 'Grown outside, ready for outside.',
    story:
      'Six polytunnels behind a farm gate: hardy stock raised without heat, so it takes the weather when it is planted.',
    hours: 'Mon–Sat 8:30–17:30 · Sun 10:00–16:00',
    phone: `${BASE_PHONE}27`,
    address: 'Ridgeway Farm, Lower Lane',
    accent: '#4a6b1f',
    features: ['catalog', 'ordering', 'offers', 'booking', 'gallery'],
    vocab: {
      catalog: 'Nursery',
      item: 'plant',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a planting visit',
      quoteTitle: 'Ask the grower',
      partyLabel: 'People',
      fulfilment: ['At the nursery', 'Local delivery'],
      homeCta: 'See what is ready',
      slots: ['08:30', '10:00', '11:30', '13:00', '15:00'],
    },
    menu: [
      {
        name: 'Shrubs',
        items: [
          { name: 'Lavender', desc: '9cm pots, hardy', price: 800 },
          { name: 'Hydrangea', desc: '2 litre, pink or white', price: 2600, tag: 'Popular' },
          { name: 'Bay tree', desc: 'Half standard, 60cm', price: 4800 },
        ],
      },
      {
        name: 'Trees',
        items: [
          { name: 'Field maple', desc: 'Bare root, 1.2m', price: 3600 },
          { name: 'Rowan', desc: 'Bare root, 1.5m', price: 4200 },
        ],
      },
      {
        name: 'Bedding & compost',
        items: [
          { name: 'Wildflower tray', desc: 'Six plugs, native mix', price: 1400 },
          { name: 'Compost', desc: '40 litres, peat free', price: 1100 },
        ],
      },
    ],
    offers: [
      { title: 'Bare root season', body: 'Trees in while the ground is cold.' },
      { title: 'Free trailer loan', body: 'For anything over a metre.' },
    ],
    loyalty: { goal: 5, reward: 'A bag of compost on us' },
  },

  courses: {
    id: 'courses',
    label: 'Online courses',
    blurb: 'Course catalogue, lessons, access',
    glyph: '🎓',
    kind: 'Online learning platform',
    tagline: 'Learn it properly, at your own pace.',
    story:
      'Short, practical courses built by people who do the work: twelve lessons, one project, feedback at the end.',
    hours: 'Lessons open any time',
    phone: `${BASE_PHONE}34`,
    address: 'Online, taught from Bristol',
    accent: '#3f4bd8',
    features: ['catalog', 'ordering', 'offers', 'reviews', 'loyalty'],
    vocab: {
      catalog: 'Courses',
      item: 'course',
      order: 'Basket',
      book: 'Book',
      bookTitle: 'Book a call',
      quoteTitle: 'Ask about a course',
      partyLabel: 'Learners',
      fulfilment: ['Online'],
      homeCta: 'Browse the courses',
      slots: [],
    },
    menu: [
      {
        name: 'Foundations',
        items: [
          { name: 'Read a set of accounts', desc: 'Six lessons, two hours each', price: 14900 },
          { name: 'Write for work', desc: 'Eight lessons, templates included', price: 12900, tag: 'Popular' },
        ],
      },
      {
        name: 'Professional',
        items: [
          { name: 'Bookkeeping, properly', desc: 'Twelve lessons, one project', price: 34900 },
          { name: 'Manage a small team', desc: 'Ten lessons, scripts and reviews', price: 29900 },
        ],
      },
      {
        name: 'Short courses',
        items: [
          { name: 'Spreadsheets that hold up', desc: 'Three lessons', price: 4900 },
          { name: 'Pricing your work', desc: 'Two lessons', price: 3900 },
        ],
      },
    ],
    offers: [
      { title: 'Two courses, 20% off', body: 'Any pair, this month only.' },
      { title: 'Free first lesson', body: 'Every course, no card needed.' },
    ],
    loyalty: { goal: 2, reward: 'A free short course' },
    team: [
      { name: 'Rosa Bell', role: 'Course lead', credential: 'Finance & operations' },
      { name: 'Tomas Reed', role: 'Writing tutor', credential: 'Editorial' },
    ],
  },

  tuition: {
    id: 'tuition',
    label: 'Tuition centre',
    blurb: 'Subjects, tutors, term bookings',
    glyph: '📚',
    kind: 'Tuition centre',
    tagline: 'Small groups, steady progress.',
    story:
      'Four rooms above a bakery, six students to a table, and a report home every half term that says what actually changed.',
    hours: 'Mon–Thu 15:30–20:00 · Sat 9:00–13:00',
    phone: `${BASE_PHONE}41`,
    address: 'First floor, 22 Mill Street',
    accent: '#a2521f',
    features: ['catalog', 'booking', 'offers', 'reviews'],
    vocab: {
      catalog: 'Programmes',
      item: 'programme',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a trial lesson',
      quoteTitle: 'Ask about a place',
      partyLabel: 'Students',
      fulfilment: ['At the centre'],
      homeCta: 'Book a trial lesson',
      slots: ['15:30', '16:30', '17:30', '18:30', '19:30'],
    },
    menu: [
      {
        name: 'Maths',
        items: [
          { name: 'GCSE maths', desc: 'Weekly, six to a group', price: 3200, meta: 'per lesson' },
          { name: 'A-level maths', desc: 'Weekly, four to a group', price: 4200, meta: 'per lesson' },
        ],
      },
      {
        name: 'English',
        items: [
          { name: 'GCSE English', desc: 'Weekly, six to a group', price: 3200, meta: 'per lesson', tag: 'Popular' },
          { name: 'Reading support', desc: 'One to one, 45 minutes', price: 4800, meta: 'per lesson' },
        ],
      },
      {
        name: 'Sciences',
        items: [
          { name: 'Combined science', desc: 'Weekly, six to a group', price: 3400, meta: 'per lesson' },
          { name: 'Exam technique', desc: 'Six-week block, May', price: 18000, meta: 'block' },
        ],
      },
    ],
    offers: [
      { title: 'Free assessment', body: 'Half an hour, written feedback.' },
      { title: 'Sibling rate', body: 'Ten per cent off the second place.' },
    ],
    loyalty: { goal: 10, reward: 'A free lesson' },
  },

  school: {
    id: 'school',
    label: 'School',
    blurb: 'Term dates, clubs, parents’ evenings',
    glyph: '🏫',
    kind: 'Primary school',
    tagline: 'Curious children, capable adults.',
    story:
      'Two-form entry, a garden with chickens, and a head who knows every name by the second week.',
    hours: 'Gates 8:40 · Pick-up 15:15',
    phone: `${BASE_PHONE}53`,
    address: 'Fernhill Road, Westbury',
    accent: '#1f4f8f',
    features: ['catalog', 'booking', 'classes', 'events', 'offers', 'gallery'],
    events: [
      { title: 'Parents’ evening', when: 'Tue 12 Nov' },
      { title: 'Winter fair', when: 'Sat 7 Dec' },
    ],
    vocab: {
      catalog: 'Clubs & term',
      item: 'club',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a parents’ evening',
      quoteTitle: 'Ask the office',
      partyLabel: 'Guests',
      fulfilment: ['At school'],
      homeCta: 'Book a parents’ evening',
      slots: ['15:30', '16:00', '16:30', '17:00', '17:30'],
    },
    menu: [
      {
        name: 'Clubs',
        items: [
          { name: 'Forest school', desc: 'Thursdays, years 2–4', price: 6000, meta: 'per term' },
          { name: 'Choir', desc: 'Tuesdays, all years', price: 0, meta: 'free' },
          { name: 'Coding club', desc: 'Fridays, years 4–6', price: 4500, meta: 'per term', tag: 'Popular' },
        ],
      },
      {
        name: 'Term dates',
        items: [
          { name: 'Autumn term', desc: '3 Sept – 19 Dec', price: 0, meta: '89 days' },
          { name: 'Half term', desc: '27–31 Oct', price: 0, meta: 'closed' },
        ],
      },
    ],
    offers: [
      { title: 'Open morning', body: 'First Tuesday of the month, 9:30.' },
      { title: 'Breakfast club', body: 'From 7:45, no need to book.' },
    ],
    loyalty: { goal: 2, reward: 'Priority club places' },
    timetable: [
      { name: 'Year 3 swimming', when: 'Mon 09:00', coach: 'Ms Okafor' },
      { name: 'Choir', when: 'Tue 12:30', coach: 'Mr Bell' },
      { name: 'Forest school', when: 'Thu 10:00', coach: 'Mrs Ives' },
    ],
  },

  kindergarten: {
    id: 'kindergarten',
    label: 'Kindergarten',
    blurb: 'Sessions, fees, enrolment',
    glyph: '🧸',
    kind: 'Kindergarten and preschool',
    tagline: 'Small days, big discoveries.',
    story:
      'One room, eighteen children and a garden with a mud kitchen. Ratios better than the law requires.',
    hours: 'Mon–Fri 7:30–18:00',
    phone: `${BASE_PHONE}61`,
    address: 'The Old School Room, Chapel Lane',
    accent: '#c2557a',
    features: ['catalog', 'booking', 'offers', 'gallery', 'reviews'],
    vocab: {
      catalog: 'Sessions',
      item: 'session',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a visit',
      quoteTitle: 'Ask about a place',
      partyLabel: 'Children',
      fulfilment: ['At the kindergarten'],
      homeCta: 'Book a visit',
      slots: ['09:00', '10:00', '11:00', '14:00', '15:00'],
    },
    menu: [
      {
        name: 'Sessions',
        items: [
          { name: 'Morning session', desc: '8:45–12:00, snack included', price: 2400, meta: 'per day' },
          { name: 'Full day', desc: '8:45–15:30, lunch included', price: 4200, meta: 'per day', tag: 'Popular' },
          { name: 'Term place', desc: 'Five mornings a week', price: 32000, meta: 'per term' },
        ],
      },
      {
        name: 'Extras',
        items: [
          { name: 'Breakfast club', desc: 'From 7:30', price: 600, meta: 'per day' },
          { name: 'Lunch', desc: 'Cooked on site', price: 350, meta: 'per day' },
        ],
      },
    ],
    offers: [
      { title: 'Two settling visits', body: 'Free, before your start date.' },
      { title: 'Sibling discount', body: 'Ten per cent on the second child.' },
    ],
    loyalty: { goal: 3, reward: 'A free breakfast club week' },
  },

  finance: {
    id: 'finance',
    label: 'Financial services',
    blurb: 'Advice, mortgages, protection',
    glyph: '📈',
    kind: 'Independent financial adviser',
    tagline: 'Plain numbers, no surprises.',
    story:
      'Unhurried financial advice for people who would rather understand the plan than be sold one.',
    hours: 'Mon–Fri 9:00–17:30',
    phone: `${BASE_PHONE}77`,
    address: 'Suite 2, Corn Exchange',
    accent: '#145a4a',
    features: ['catalog', 'quote', 'booking', 'reviews', 'offers'],
    vocab: {
      catalog: 'Services',
      item: 'service',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a call',
      quoteTitle: 'Request a review',
      quoteNote: 'Tell us what you would like to review and roughly when. Please do not include account numbers or balances in this form.',
      partyLabel: 'Attendees',
      fulfilment: ['Online', 'In person'],
      homeCta: 'Request a review',
      slots: ['09:00', '10:30', '12:00', '14:00', '15:30'],
    },
    menu: [
      {
        name: 'Planning',
        items: [
          { name: 'Financial review', desc: 'Two meetings, written plan', price: 45000, meta: 'fixed fee' },
          { name: 'Retirement check', desc: 'Where you are, what it buys', price: 30000, meta: 'fixed fee', tag: 'Popular' },
        ],
      },
      {
        name: 'Mortgages',
        items: [
          { name: 'First-time buyer', desc: 'Whole of market', price: 0, meta: 'fee on completion' },
          { name: 'Remortgage', desc: 'Includes product switch', price: 0, meta: 'from $499' },
        ],
      },
      {
        name: 'Protection',
        items: [
          { name: 'Life cover', desc: 'Family or mortgage linked', price: 0, meta: 'quoted' },
          { name: 'Income protection', desc: 'Short or long term', price: 0, meta: 'quoted' },
        ],
      },
    ],
    offers: [
      { title: 'First meeting free', body: 'Thirty minutes, no paperwork.' },
      { title: 'Annual check-in', body: 'Included for review clients.' },
    ],
    loyalty: { goal: 2, reward: 'A free annual check-in' },
    staff: ['Helen Marsh', 'Owen Shah'],
    team: [
      { name: 'Helen Marsh', role: 'Independent adviser', credential: 'FPFS' },
      { name: 'Owen Shah', role: 'Mortgage adviser', credential: 'CeMAP' },
    ],
  },

  agency: {
    id: 'agency',
    label: 'Business agency',
    blurb: 'Capabilities, case studies, proposals',
    glyph: '💼',
    kind: 'Brand and growth agency',
    tagline: 'Strategy first, then the work.',
    story:
      'Nine people, no account managers: the strategist who pitches the work is the one who does it.',
    hours: 'Mon–Fri 9:00–18:00',
    phone: `${BASE_PHONE}88`,
    address: 'Second floor, 4 Wharf Street',
    accent: '#b8400f',
    features: ['catalog', 'quote', 'reviews', 'gallery', 'offers'],
    vocab: {
      catalog: 'Services',
      item: 'service',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a call',
      quoteTitle: 'Request a proposal',
      partyLabel: 'Attendees',
      fulfilment: ['Online', 'On site'],
      homeCta: 'Request a proposal',
      slots: ['10:00', '11:30', '14:00', '15:30'],
    },
    menu: [
      {
        name: 'Strategy',
        items: [
          { name: 'Positioning sprint', desc: 'Two weeks, one workshop', price: 850000, meta: 'from' },
          { name: 'Brand audit', desc: 'Where you stand, plainly', price: 320000, meta: 'from' },
        ],
      },
      {
        name: 'Build',
        items: [
          { name: 'Website', desc: 'Design and build, six weeks', price: 1400000, meta: 'from', tag: 'Popular' },
          { name: 'Campaign', desc: 'Launch assets, one quarter', price: 650000, meta: 'from' },
        ],
      },
      {
        name: 'Ongoing',
        items: [
          { name: 'Retainer', desc: 'Two days a month', price: 240000, meta: 'per month' },
          { name: 'Advisory', desc: 'Monthly session', price: 90000, meta: 'per month' },
        ],
      },
    ],
    offers: [
      { title: 'Two-week audit', body: 'Fixed fee, no pitch deck.' },
      { title: 'Referral credit', body: 'A day off your next project.' },
    ],
    loyalty: { goal: 2, reward: 'A free strategy session' },
  },

  influencer: {
    id: 'influencer',
    label: 'Influencer & creator',
    blurb: 'Formats, rates, brand collabs',
    glyph: '🎥',
    kind: 'Creator and presenter',
    tagline: 'One camera, a hundred briefs.',
    story:
      'Home and food, filmed in a real kitchen: three formats a month, no set builds, everything shot and edited in-house.',
    hours: 'Replies Mon–Thu, 9:00–17:00',
    phone: `${BASE_PHONE}96`,
    address: 'Based in Manchester, films anywhere',
    accent: '#c72f6b',
    features: ['catalog', 'quote', 'gallery', 'reviews', 'offers', 'events'],
    events: [
      { title: 'Live brand Q&A', when: 'Thu 20:00' },
      { title: 'Meet-up, Manchester', when: 'Sat 14:00' },
    ],
    vocab: {
      catalog: 'Collabs',
      galleryTitle: 'On set',
      item: 'format',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a shoot day',
      quoteTitle: 'Request the rate card',
      partyLabel: 'People',
      fulfilment: ['Remote', 'On location'],
      homeCta: 'Request the rate card',
      slots: ['10:00', '11:30', '14:00', '15:30'],
    },
    menu: [
      {
        name: 'Formats',
        items: [
          { name: 'Sponsored reel', desc: '30–45s, one round of edits', price: 0, meta: 'from $1,800' },
          { name: 'Long-form video', desc: 'Six to eight minutes', price: 0, meta: 'from $3,200', tag: 'Popular' },
          { name: 'Story set', desc: 'Three frames with links', price: 0, meta: 'from $650' },
        ],
      },
      {
        name: 'Usage & exclusivity',
        items: [
          { name: '30-day paid usage', desc: 'One channel, one market', price: 0, meta: 'from $300' },
          { name: 'Category exclusivity', desc: 'No competitor for 90 days', price: 0, meta: 'from $900' },
        ],
      },
    ],
    offers: [
      { title: 'Q3 dates open', body: 'Two shoot days left before September.' },
      { title: 'Three-reel bundle', body: 'Book three, the edit is included.' },
    ],
    loyalty: { goal: 3, reward: 'An extra story set on your next brief' },
  },

  portfolio: {
    id: 'portfolio',
    label: 'Personal portfolio',
    blurb: 'Selected work, process, enquiries',
    glyph: '🗂',
    kind: 'Designer and art director',
    tagline: 'Quiet work, made carefully.',
    story:
      'Identity and editorial design for small presses, studios and the odd museum. One person, no account managers.',
    hours: 'Studio Mon–Fri 10:00–18:00',
    phone: `${BASE_PHONE}03`,
    address: 'Studio 3, Old Bakery Yard',
    accent: '#2b2b2b',
    features: ['catalog', 'quote', 'gallery', 'reviews'],
    vocab: {
      catalog: 'Work',
      item: 'project',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book an intro call',
      quoteTitle: 'Start a project',
      partyLabel: 'Attendees',
      fulfilment: ['Online', 'In studio'],
      homeCta: 'Start a project',
      slots: ['10:00', '11:00', '14:00', '16:00'],
    },
    menu: [
      {
        name: 'Identity',
        items: [
          { name: 'Field Notes Press', desc: 'Wordmark, covers, series system', price: 0, meta: '2024' },
          { name: 'Kelvin Coffee', desc: 'Identity and packaging', price: 0, meta: '2023', tag: 'Selected' },
        ],
      },
      {
        name: 'Editorial',
        items: [
          { name: 'The Long Room, issue 4', desc: 'Art direction, 96 pages', price: 0, meta: '2024' },
          { name: 'Museum quarterly', desc: 'Grid and type system', price: 0, meta: '2022' },
        ],
      },
      {
        name: 'Digital',
        items: [
          { name: 'Studio archive', desc: 'Site and image system', price: 0, meta: '2023' },
        ],
      },
    ],
    offers: [
      { title: 'Two project slots', body: 'Autumn, identity or editorial.' },
      { title: 'Portfolio reviews', body: 'Thirty minutes, free, Thursdays.' },
    ],
    loyalty: { goal: 2, reward: 'A free type workshop' },
  },

  film: {
    id: 'film',
    label: 'Film & production',
    blurb: 'Cast, crew, stills, trailers',
    glyph: '🎬',
    kind: 'Independent film production',
    tagline: 'Ninety minutes, one house, two actors.',
    story:
      'Shot over nineteen days in a rented terrace: a two-hander about a house being sold, and everyone who has to leave it.',
    hours: 'Screenings 18:00–22:00',
    phone: `${BASE_PHONE}12`,
    address: 'Unit 2, Mercury Works',
    accent: '#b8862b',
    features: ['catalog', 'booking', 'gallery', 'reviews', 'offers'],
    vocab: {
      catalog: 'The film',
      galleryTitle: 'Stills & posters',
      item: 'credit',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a screening',
      quoteTitle: 'Request press materials',
      partyLabel: 'Guests',
      fulfilment: ['Cinemas', 'Online'],
      homeCta: 'Book a screening',
      slots: ['18:00', '19:30', '21:00'],
    },
    menu: [
      {
        name: 'Cast',
        items: [
          { name: 'Mara Ellison', desc: 'Viv', price: 0, meta: 'lead' },
          { name: 'Jonah Reed', desc: 'Sam', price: 0, meta: 'lead' },
          { name: 'Priya Nair', desc: 'The neighbour', price: 0, meta: 'support', tag: 'Ensemble' },
        ],
      },
      {
        name: 'Crew',
        items: [
          { name: 'Ruth Calder', desc: 'Director, co-writer', price: 0, meta: 'crew' },
          { name: 'Ade Ogun', desc: 'Cinematographer', price: 0, meta: 'crew' },
          { name: 'Lena Vos', desc: 'Editor and score', price: 0, meta: 'crew' },
        ],
      },
      {
        name: 'Screenings',
        items: [
          { name: 'Opening night', desc: 'With director Q&A', price: 1600, meta: '18 Oct' },
          { name: 'Saturday matinee', desc: 'Subtitled', price: 1200, meta: '20 Oct' },
        ],
      },
    ],
    offers: [
      { title: 'Festival run', body: 'Four screenings with the cast present.' },
      { title: 'Director Q&A', body: 'Stay after the Friday show.' },
    ],
    loyalty: { goal: 2, reward: 'A signed still from the shoot' },
  },

  gallery: {
    id: 'gallery',
    label: 'Art gallery',
    blurb: 'Exhibitions, artists, works',
    glyph: '🖼',
    kind: 'Contemporary art gallery',
    tagline: 'Hung slowly, looked at for longer.',
    story:
      'A converted print works showing eight exhibitions a year: painting, work on paper, and the occasional piece that will not fit through the door.',
    hours: 'Wed–Sun 11:00–18:00',
    phone: `${BASE_PHONE}71`,
    address: '12 Kiln Lane',
    accent: '#6a4a30',
    features: ['catalog', 'booking', 'events', 'gallery'],
    events: [
      { title: 'Private view: Low Tide, High Window', when: 'Thu 18:00' },
      { title: 'Members’ hour', when: 'Sun 10:00' },
    ],
    vocab: {
      catalog: 'On view',
      galleryTitle: 'The rooms',
      item: 'work',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a viewing',
      quoteTitle: 'Ask about a work',
      partyLabel: 'Guests',
      fulfilment: ['In gallery', 'Shipping'],
      homeCta: 'See what’s on',
      slots: ['11:00', '12:30', '14:00', '16:00'],
    },
    menu: [
      {
        name: 'Works on view',
        items: [
          { name: 'Kiln Study II', desc: 'Ada Mensah · oil on board', price: 185000, meta: '42 × 30 cm', tag: 'Current' },
          { name: 'Green Interior', desc: 'Ines Kaur · gouache', price: 64000, meta: '30 × 22 cm' },
          { name: 'Shore, Late', desc: 'Ada Mensah · oil on linen', price: 420000, meta: '120 × 90 cm' },
        ],
      },
      {
        name: 'Editions',
        items: [
          { name: 'Tide Line', desc: 'Print, edition of 40', price: 18000, meta: '50 × 40 cm' },
          { name: 'Rooms We Left', desc: 'Risograph, edition of 60', price: 9500, meta: 'A3' },
        ],
      },
      {
        name: 'Sculpture',
        items: [
          { name: 'Bench for a Small Room', desc: 'Tom Rees · oak', price: 260000, meta: '140 × 40 cm' },
        ],
      },
    ],
    offers: [
      { title: 'Low Tide, High Window', body: 'Ada Mensah · until 14 Dec' },
      { title: 'Rooms We Left', body: 'Ines Kaur · until 22 Feb' },
    ],
    loyalty: { goal: 3, reward: 'A print from the current show' },
  },

  marketplace: {
    id: 'marketplace',
    label: 'Marketplace',
    blurb: 'Many stores, one basket',
    glyph: '🏬',
    kind: 'Multi-vendor delivery marketplace',
    tagline: 'Every shop on the street, one basket.',
    story:
      'Neighbourhood stores deliver in under half an hour: groceries, snacks, a hot meal and the late-night pharmacy, ordered together and tracked to the door.',
    hours: 'Delivery 09:00–23:00',
    phone: `${BASE_PHONE}88`,
    address: 'Riverside · two delivery zones',
    accent: '#d98324',
    features: ['catalog', 'ordering', 'delivery', 'offers', 'loyalty', 'gallery'],
    vocab: {
      catalog: 'Shop',
      galleryTitle: 'This week',
      item: 'item',
      order: 'Order',
      book: 'Book',
      bookTitle: 'Book a slot',
      quoteTitle: 'List your store',
      partyLabel: 'People',
      fulfilment: ['Delivery', 'Collection'],
      homeCta: 'Shop the market',
      slots: [],
      listingSpecLabel: 'Delivery',
    },
    menu: [
      {
        name: 'Food delivery',
        items: [
          { name: 'Family Pack Special', desc: 'Biryani, kebabs and breads, serves 2–3', vendor: 'Food Square', price: 19900, meta: '15 min', tag: 'Popular' },
          { name: 'Chicken Momos', desc: 'Steamed, chilli oil, eight pieces', vendor: 'Food Corner', price: 12000, meta: '20 min' },
        ],
      },
      {
        name: 'Groceries',
        items: [
          { name: 'Fresh Fruit Basket', desc: 'Seasonal fruit, 2 kg box', vendor: 'Fresh Mart Grocery', price: 7000, meta: '18 min' },
          { name: 'Lucky Day Veg Box', desc: 'Eight vegetables, market weight', vendor: 'Fresh Mart Grocery', price: 10000, meta: '18 min', tag: '20% off' },
        ],
      },
      {
        name: 'Snacks & drinks',
        items: [
          { name: 'Chips & Namkeen Combo', desc: 'Three packs, party size', vendor: 'Snack Stop', price: 5000, meta: '12 min' },
          { name: 'Biscuits & Cookies Pack', desc: 'Family tin, four varieties', vendor: 'Snack Stop', price: 2500, meta: '12 min' },
        ],
      },
      {
        name: 'Wellness',
        items: [
          { name: 'Vitamin C & D3', desc: '60 tablets, one a day', vendor: 'Health Choice', price: 14000, meta: '25 min' },
        ],
      },
    ],
    offers: [
      { title: 'HouseFull Sale', body: 'Up to 30% off groceries, until 7 Dec.' },
      { title: 'Free delivery over $25', body: 'One basket, any number of stores.' },
    ],
    loyalty: { goal: 4, reward: '$5 wallet credit on your next order' },
  },
}

/** Which screen the home hero's first button should open. */
const CTA: Record<VerticalId, 'order' | 'book' | 'quote' | 'catalog'> = {
  restaurant: 'order',
  cafe: 'order',
  shop: 'order',
  salon: 'book',
  gym: 'book',
  clinic: 'book',
  trades: 'quote',
  professional: 'quote',
  property: 'quote',
  hotel: 'book',
  studio: 'quote',
  auto: 'book',
  hospital: 'book',
  ecommerce: 'order',
  'plants-indoor': 'order',
  'plants-outdoor': 'order',
  courses: 'order',
  tuition: 'book',
  school: 'book',
  kindergarten: 'book',
  finance: 'quote',
  agency: 'quote',
  gallery: 'catalog',
  marketplace: 'order',
  influencer: 'quote',
  portfolio: 'quote',
  film: 'book',
}

export function ctaFor(id: VerticalId): 'order' | 'book' | 'quote' | 'catalog' {
  return CTA[id] ?? 'catalog'
}

export const VERTICAL_IDS = Object.keys(VERTICALS) as VerticalId[]

export function isVerticalId(value: unknown): value is VerticalId {
  return typeof value === 'string' && value in VERTICALS
}

export function verticalFor(value: unknown): Vertical {
  return isVerticalId(value) ? VERTICALS[value] : VERTICALS.restaurant
}

export const VERTICAL_GROUPS: { label: string; ids: VerticalId[] }[] = [
  {
    label: 'Food & drink',
    ids: ['restaurant', 'cafe'],
  },
  {
    label: 'Retail & property',
    ids: ['shop', 'ecommerce', 'marketplace', 'plants-indoor', 'plants-outdoor', 'property', 'hotel'],
  },
  {
    label: 'Learning',
    ids: ['courses', 'tuition', 'school', 'kindergarten'],
  },
  {
    label: 'Health & beauty',
    ids: ['salon', 'gym', 'clinic', 'hospital'],
  },
  {
    label: 'Services & trades',
    ids: ['trades', 'professional', 'agency', 'finance', 'auto'],
  },
  {
    label: 'Creative & media',
    ids: ['studio', 'portfolio', 'film', 'gallery', 'influencer'],
  },
]
