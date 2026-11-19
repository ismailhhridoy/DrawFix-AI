/**
 * Reference notes used by the code question box and the review note.
 *
 * Every note states its basis. 'verified' notes restate sentences read in the
 * BNBC 2012 text (Part 3, Chapter 1, law.resource.org copy). 'screening' notes
 * describe thresholds this prototype uses that have NOT been checked against
 * the gazette, and say so in their text, so an answer built from them cannot
 * present them as law.
 */
export interface RegulatoryClauseChunk {
  id: string;
  docId: 'BNBC_2012' | 'PROTOTYPE_SCREENING' | 'DRAWING_CHECK';
  basis: 'verified' | 'screening' | 'drawing';
  part: string;
  clause: string;
  title: string;
  occupancyScope: ('industrial_rmg' | 'residential' | 'mixed' | 'all')[];
  topics: string[];
  keywords: string[];
  text: string;
  /** Bangla title and text: machine draft of the English note, same numbers. Needs native review. */
  titleBn: string;
  textBn: string;
  /** Bangla words a reviewer might type for this topic (used by the offline question box). */
  keywordsBn: string[];
}

export const REGULATORY_CORPUS: RegulatoryClauseChunk[] = [
  {
    id: 'bnbc-2012-1.13.8.2-cabins',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.13.8.2',
    title: 'Cabins: 0.75 m passages and 16 m to an exit',
    occupancyScope: ['all'],
    topics: ['travel_distance', 'passage_width', 'cabin', 'egress'],
    keywords: ['16m', '16', '0.75m', '0.75', 'cabin', 'chamber', 'partition', 'passage', 'travel distance', 'corridor'],
    text: 'Verified in the source text. Where an open floor is divided into cabins or chambers by partitions, clear passages at least 0.75 m wide shall be maintained between the cabins, leading to a means of exit which shall in no case be further than 16 m from any cabin. The clause is written for cabins; this tool applies the 16 m figure to cabins as a rule and to other rooms only as a screening reference.',
    titleBn: "কেবিন: ০.৭৫ মিটার চলাচলের পথ এবং বহির্গমন পর্যন্ত ১৬ মিটার",
    textBn: "মূল পাঠে যাচাই করা। খোলা মেঝে পার্টিশন দিয়ে কেবিন বা কক্ষে ভাগ করা হলে কেবিনগুলোর মাঝে কমপক্ষে ০.৭৫ মিটার চওড়া খোলা চলাচলের পথ রাখতে হবে, যা বহির্গমন পথে পৌঁছায়; কোনো কেবিন থেকে সেই বহির্গমন পথ কোনো অবস্থাতেই ১৬ মিটারের বেশি দূরে হবে না। ধারাটি কেবিনের জন্য লেখা; এই টুল ১৬ মিটার সংখ্যাটি কেবিনে বিধি হিসেবে এবং অন্য কক্ষে শুধু স্ক্রিনিং মানদণ্ড হিসেবে প্রয়োগ করে।",
    keywordsBn: ["কেবিন", "চেম্বার", "পার্টিশন", "দূরত্ব", "হাঁটার দূরত্ব", "বের হওয়ার পথ", "বহির্গমন পথ", "সর্বোচ্চ দূরত্ব", "করিডোর", "চলাচলের পথ"],
  },
  {
    id: 'bnbc-2012-1.13.5-stairs',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.13.5.2, 1.13.5.4, 1.13.5.6',
    title: 'Stairs: riser and tread, headroom, handrail',
    occupancyScope: ['all'],
    topics: ['stair_safety', 'headroom', 'handrail', 'riser', 'tread'],
    keywords: ['2.15m', '2.15', '2.03', 'headroom', '0.9m', '0.90', 'handrail', '610', '648', '2R+T', 'riser', 'tread', 'stair'],
    text: 'Verified in the source text. The sum of two risers and one tread, excluding nosing, shall not be less than 610 mm and not more than 648 mm (Sec 1.13.5.2). Minimum clear headroom between flights is 2.15 m, which may be reduced to 2.03 m for not more than three flights in a staircase (Sec 1.13.5.4). Handrails shall be at least 0.9 m high measured from the nosing (Sec 1.13.5.6). Minimum stair width is not given here; the section refers to Part 4, Table 4.3.6.',
    titleBn: "সিঁড়ি: রাইজার ও ট্রেড, মাথার উপরের ফাঁকা উচ্চতা, হাতল",
    textBn: "মূল পাঠে যাচাই করা। নোজিং বাদে দুইটি রাইজার ও একটি ট্রেডের যোগফল ৬১০ মিমি-এর কম এবং ৬৪৮ মিমি-এর বেশি হবে না (ধারা 1.13.5.2)। দুই ধাপসারির মাঝে মাথার উপরের ন্যূনতম ফাঁকা উচ্চতা ২.১৫ মিটার, যা একটি সিঁড়িতে অনধিক তিনটি ধাপসারির জন্য ২.০৩ মিটার পর্যন্ত কমানো যায় (ধারা 1.13.5.4)। হাতল নোজিং থেকে মেপে কমপক্ষে ০.৯ মিটার উঁচু হবে (ধারা 1.13.5.6)। সিঁড়ির ন্যূনতম প্রস্থ এখানে দেওয়া নেই; ধারাটি খণ্ড ৪, সারণি 4.3.6-এ পাঠায়।",
    keywordsBn: ["সিঁড়ি", "সিড়ি", "সোপান", "রাইজার", "ট্রেড", "ধাপ", "হাতল", "রেলিং", "মাথার উপরের উচ্চতা", "হেডরুম"],
  },
  {
    id: 'bnbc-2012-1.13.2.2-bedroom',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.13.2.2',
    title: 'Sleeping room: 9.5 m² and 2.9 m wide',
    occupancyScope: ['residential', 'mixed'],
    topics: ['habitability', 'room_area', 'bedroom'],
    keywords: ['bedroom', 'sleeping', '9.5', '2.9', 'habitable', 'minimum area', 'room size', 'width'],
    text: 'Verified in the source text. The sleeping room of a dwelling unit shall not be less than 9.5 m² of net floor area, with a minimum width of 2.9 m.',
    titleBn: "শয়নকক্ষ: ৯.৫ বর্গমিটার এবং ২.৯ মিটার চওড়া",
    textBn: "মূল পাঠে যাচাই করা। আবাসিক ইউনিটের শয়নকক্ষের নিট মেঝের আয়তন ৯.৫ বর্গমিটারের কম হবে না, এবং ন্যূনতম প্রস্থ হবে ২.৯ মিটার।",
    keywordsBn: ["শয়নকক্ষ", "শয়ন", "শোবার ঘর", "বেডরুম", "ঘরের আয়তন", "কক্ষের আকার", "ন্যূনতম আয়তন", "প্রস্থ"],
  },
  {
    id: 'bnbc-2012-1.17.6-light',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.17.6 / Table 3.1.12',
    title: 'Light and ventilation openings: 15% of floor area',
    occupancyScope: ['residential', 'mixed'],
    topics: ['ventilation', 'daylight', 'windows', 'habitability'],
    keywords: ['window', 'daylight', 'ventilation', '15%', '18%', 'opening', 'kitchen', 'natural light'],
    text: 'Verified in the source text. Habitable rooms used for sleeping, living, study or dining need an aggregate opening area of 15% of net floor area; kitchens need 18%. This tool does not know window heights, so it only reports rooms on which no window was found.',
    titleBn: "আলো ও বাতাস চলাচলের খোলা অংশ: মেঝের আয়তনের ১৫%",
    textBn: "মূল পাঠে যাচাই করা। ঘুম, বসবাস, পড়াশোনা বা খাওয়ার জন্য ব্যবহৃত বাসযোগ্য কক্ষে মোট খোলা অংশ নিট মেঝের আয়তনের ১৫% হতে হবে; রান্নাঘরে ১৮%। এই টুল জানালার উচ্চতা জানে না, তাই শুধু যে কক্ষে কোনো জানালা পাওয়া যায়নি সেগুলো জানায়।",
    keywordsBn: ["জানালা", "আলো", "বাতাস", "বায়ু চলাচল", "দিনের আলো", "রান্নাঘর", "খোলা অংশ"],
  },
  {
    id: 'bnbc-2012-1.2-highrise',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.2 (definitions)',
    title: 'High-rise: more than 20 m above road level',
    occupancyScope: ['all'],
    topics: ['high_rise', 'height'],
    keywords: ['20m', '20', 'high rise', 'highrise', 'height', 'tall', '80m'],
    text: 'Verified in the source text. A high-rise building is one located more than 20 m above the centre of the adjacent road level. Additional fire provisions in Part 4 apply to high-rise buildings and require reviewer verification.',
    titleBn: "বহুতল ভবন: রাস্তার স্তর থেকে ২০ মিটারের বেশি",
    textBn: "মূল পাঠে যাচাই করা। পাশের রাস্তার মাঝখানের স্তর থেকে ২০ মিটারের বেশি উঁচু ভবন বহুতল ভবন। বহুতল ভবনে খণ্ড ৪-এর অতিরিক্ত অগ্নি-বিধান প্রযোজ্য, যা পর্যালোচককে যাচাই করতে হবে।",
    keywordsBn: ["বহুতল", "উঁচু ভবন", "উচ্চতা", "হাইরাইজ", "লিফট", "তলা"],
  },
  {
    id: 'screen-exit-doors',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'Exit doors',
    title: 'Exit door width, locked exits and number of exits',
    occupancyScope: ['all'],
    topics: ['door_width', 'exit_door', 'locked_door', 'dual_exits'],
    keywords: ['0.90', '0.9', 'door width', 'locked', 'two exits', 'dual', 'exit count', 'obstructed'],
    text: 'Not verified against the gazette. This tool flags exit doors narrower than 0.90 m, exits drawn as locked, and floors with fewer than two usable exits or stairs. These are screening thresholds; the governing clauses are in BNBC Part 4, Ch. 3 (Means of Escape), which was not available to verify.',
    titleBn: "বহির্গমন দরজার প্রস্থ, তালাবদ্ধ বহির্গমন ও বহির্গমনের সংখ্যা",
    textBn: "গেজেটের সঙ্গে যাচাই করা হয়নি। এই টুল ০.৯০ মিটারের চেয়ে সরু বহির্গমন দরজা, তালাবদ্ধ দেখানো বহির্গমন, এবং যে তলায় দুইটির কম ব্যবহারযোগ্য বহির্গমন বা সিঁড়ি আছে তা চিহ্নিত করে। এগুলো স্ক্রিনিং সীমা; প্রযোজ্য ধারা বিএনবিসি খণ্ড ৪, অধ্যায় ৩ (পলায়নের উপায়)-এ আছে, যা যাচাই করার জন্য পাওয়া যায়নি।",
    keywordsBn: ["দরজা", "ফটক", "বহির্গমন", "বের হওয়ার দরজা", "তালা", "তালাবদ্ধ", "বন্ধ", "অবরুদ্ধ", "দুইটি বহির্গমন", "দরজার প্রস্থ"],
  },
  {
    id: 'screen-travel',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'Travel distance for rooms other than cabins',
    title: 'Travel-distance screening reference (16 m, 22.5 m with sprinklers)',
    occupancyScope: ['all'],
    topics: ['travel_distance', 'sprinkler'],
    keywords: ['travel distance', 'sprinkler', 'sprinklered', '22.5', '16', 'workfloor', 'factory'],
    text: 'Not verified against the gazette. For rooms other than cabins this tool warns when the walking route to an exit exceeds 16 m, or 22.5 m if sprinklers are declared. Occupancy-specific travel-distance limits are set in BNBC Part 4, Ch. 3 and must be confirmed by the reviewer.',
    titleBn: "হাঁটার দূরত্বের স্ক্রিনিং মানদণ্ড (১৬ মিটার, স্প্রিংকলার থাকলে ২২.৫ মিটার)",
    textBn: "গেজেটের সঙ্গে যাচাই করা হয়নি। কেবিন ছাড়া অন্য কক্ষে বহির্গমন পর্যন্ত হাঁটার পথ ১৬ মিটারের বেশি হলে, অথবা স্প্রিংকলার ঘোষিত থাকলে ২২.৫ মিটারের বেশি হলে, এই টুল সতর্ক করে। ব্যবহারভেদে হাঁটার দূরত্বের সীমা বিএনবিসি খণ্ড ৪, অধ্যায় ৩-এ নির্ধারিত এবং পর্যালোচককে নিশ্চিত করতে হবে।",
    keywordsBn: ["দূরত্ব", "হাঁটার দূরত্ব", "হাঁটার", "সর্বোচ্চ দূরত্ব", "বের হওয়ার পথ", "স্প্রিংকলার", "কারখানা", "ফ্লোর"],
  },
  {
    id: 'screen-capacity',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'Occupant load and exit capacity',
    title: 'Occupant-load and capacity estimates',
    occupancyScope: ['all'],
    topics: ['occupant_load', 'exit_capacity', 'stair_capacity'],
    keywords: ['occupant load', 'capacity', '5mm', '7.5mm', 'persons', 'exit width', 'stair width'],
    text: 'Not verified against the gazette. Occupant load is estimated from room areas with assumed factors (workfloor 2.8 m² per person, lobby 1.4, office or cabin 9.3, residential 18.6, utility 28). Exit doors are assumed to pass one person per 5 mm of width and stairs one per 7.5 mm.',
    titleBn: "ব্যবহারকারীর সংখ্যা ও ধারণক্ষমতার অনুমান",
    textBn: "গেজেটের সঙ্গে যাচাই করা হয়নি। কক্ষের আয়তন থেকে অনুমিত গুণক দিয়ে ব্যবহারকারীর সংখ্যা হিসাব করা হয় (কাজের ফ্লোর জনপ্রতি ২.৮ বর্গমিটার, লবি ১.৪, অফিস বা কেবিন ৯.৩, আবাসিক ১৮.৬, ইউটিলিটি ২৮)। ধরা হয় বহির্গমন দরজা প্রতি ৫ মিমি প্রস্থে একজন এবং সিঁড়ি প্রতি ৭.৫ মিমি প্রস্থে একজন মানুষ পার করে।",
    keywordsBn: ["ধারণক্ষমতা", "লোক", "মানুষ", "জন", "ব্যবহারকারী", "সিঁড়ির প্রস্থ", "দরজার প্রস্থ"],
  },
  {
    id: 'screen-zoning',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'FAR, ground coverage and setbacks',
    title: 'Zoning screening (Dhaka Imarat Nirman Bidhimala 2008, simplified)',
    occupancyScope: ['all'],
    topics: ['far', 'mgc', 'setback', 'zoning'],
    keywords: ['FAR', 'floor area ratio', 'MGC', 'ground coverage', 'setback', 'road width', 'plot', 'imarat', 'bidhimala', 'rajuk'],
    text: 'Not verified against the gazette. When plot data is entered, this tool compares FAR with a simplified ladder by road width (2.5 below 6 m, 3.0 below 9 m, 3.25 below 12 m, 3.5 below 18 m, 4.25 above), ground coverage with 60% (62.5% for plots up to 335 m²), and setbacks with 1.5 m front, 1.5–2.0 m rear and 1.0–1.25 m side. The real schedules depend on plot size and use and must be read from the Dhaka Imarat Nirman Bidhimala 2008.',
    titleBn: "জোনিং স্ক্রিনিং (ঢাকা ইমারত নির্মাণ বিধিমালা ২০০৮, সরলীকৃত)",
    textBn: "গেজেটের সঙ্গে যাচাই করা হয়নি। প্লটের তথ্য দিলে এই টুল রাস্তার প্রস্থ অনুযায়ী একটি সরলীকৃত ধাপের সঙ্গে এফএআর তুলনা করে (৬ মিটারের কম হলে ২.৫, ৯ মিটারের কম ৩.০, ১২ মিটারের কম ৩.২৫, ১৮ মিটারের কম ৩.৫, তার বেশি ৪.২৫), ভূমি-আচ্ছাদন ৬০% এর সঙ্গে (৩৩৫ বর্গমিটার পর্যন্ত প্লটে ৬২.৫%), আর সেটব্যাক সামনে ১.৫ মিটার, পেছনে ১.৫–২.০ মিটার ও পাশে ১.০–১.২৫ মিটারের সঙ্গে। প্রকৃত তালিকা প্লটের আকার ও ব্যবহারের ওপর নির্ভর করে এবং ঢাকা ইমারত নির্মাণ বিধিমালা ২০০৮ থেকে পড়ে নিতে হবে।",
    keywordsBn: ["এফএআর", "ফার", "এমজিসি", "ভূমি-আচ্ছাদন", "আচ্ছাদন", "সেটব্যাক", "ছাড়", "রাস্তা", "রাস্তার প্রস্থ", "প্লট", "জমি", "রাজউক", "বিধিমালা", "অনুমোদন"],
  },
  {
    id: 'drawing-dimension-check',
    docId: 'DRAWING_CHECK',
    basis: 'drawing',
    part: 'Drawing consistency',
    clause: 'Dimension text',
    title: 'Typed dimension differs from the measured distance',
    occupancyScope: ['all'],
    topics: ['dimension_integrity', 'cad_override'],
    keywords: ['dimension', 'override', 'stale', 'mismatch', 'cad', 'dxf', 'text'],
    text: 'Not a code clause. A DXF dimension can carry typed text that replaces the measured value. This tool compares the typed text with the distance between the dimension points and reports a mismatch above 5 cm.',
    titleBn: "লেখা মাপ আর মাপা দূরত্ব আলাদা",
    textBn: "এটি কোনো বিধির ধারা নয়। DXF-এর একটি মাপে টাইপ করা লেখা থাকতে পারে যা মাপা মানের জায়গা নেয়। এই টুল টাইপ করা লেখা আর মাপের দুই বিন্দুর মধ্যকার দূরত্ব তুলনা করে এবং ৫ সেমি-এর বেশি পার্থক্য হলে জানায়।",
    keywordsBn: ["মাপ", "ডাইমেনশন", "মাপের লেখা", "অমিল", "নকশা", "ড্রয়িং"],
  },
];
