export const travelCards = [
  {
    slug: "tokyo-luxury-culture",
    title: "Tokyo Luxury Culture",
    location: "Tokyo, Japan",
    description:
      "Michelin dining, private city guides, modern ryokans, and late-night neon districts curated for premium discovery.",
    price: "$4,250",
    duration: "4 Days",
    match: "98%",
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1600&auto=format&fit=crop",
  },
  {
    slug: "kyoto-private-heritage",
    title: "Kyoto Private Heritage",
    location: "Kyoto, Japan",
    description:
      "Exclusive temple access, boutique ryokan stays, private tea ceremonies, and a calm cultural itinerary.",
    price: "$5,400",
    duration: "5 Days",
    match: "95%",
    image:
      "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1600&auto=format&fit=crop",
  },
  {
    slug: "bali-honeymoon-package",
    title: "Bali Honeymoon Package",
    location: "Bali, Indonesia",
    description:
      "Oceanfront villas, spa rituals, private drivers, Ubud culture, and a soft romantic itinerary for couples.",
    price: "Rp 4.800.000",
    duration: "3 Days 2 Nights",
    match: "99%",
    image:
      "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?q=80&w=1600&auto=format&fit=crop",
  },
];

export const orders = [
  {
    id: "OM-9021",
    packageName: "Bali Honeymoon Package",
    destination: "Bali, Indonesia",
    duration: "3 Days 2 Nights",
    schedule: "June 12 - June 15",
    paymentStatus: "PAID",
    orderStatus: "Processing",
    customer: "John Doe",
    phone: "+62 812-3456-7890",
    email: "john@email.com",
    bookingDate: "May 15, 2026",
    total: "Rp 4.800.000",
  },
  {
    id: "OM-9022",
    packageName: "Japan Explorer",
    destination: "Tokyo, Kyoto, Osaka",
    duration: "10 Days",
    schedule: "Nov 05 - Nov 20",
    paymentStatus: "PENDING",
    orderStatus: "Waiting Payment",
    customer: "Sarah Williams",
    phone: "+62 813-9876-5432",
    email: "sarah.w@example.com",
    bookingDate: "May 15, 2026",
    total: "Rp 12.500.000",
  },
  {
    id: "OM-9023",
    packageName: "Swiss Alps Retreat",
    destination: "Zermatt, Switzerland",
    duration: "14 Days",
    schedule: "Dec 10 - Dec 24",
    paymentStatus: "PROCESSING",
    orderStatus: "Pending",
    customer: "Michael Chen",
    phone: "+62 811-2235-4455",
    email: "m.chen@example.com",
    bookingDate: "May 14, 2026",
    total: "Rp 28.000.000",
  },
];

export const workflowSteps = [
  "Analyzing preferences",
  "Searching destinations",
  "Finding hotels",
  "Calculating budget",
  "Generating itinerary",
  "Creating payment",
];

export const payments = [
  {
    id: "PAY-1008",
    method: "QRIS",
    customer: "John Doe",
    amount: "Rp 4.800.000",
    status: "Verified",
    time: "10:42 AM",
  },
  {
    id: "PAY-1009",
    method: "Virtual Account",
    customer: "Sarah Williams",
    amount: "Rp 12.500.000",
    status: "Waiting Payment",
    time: "10:39 AM",
  },
  {
    id: "PAY-1010",
    method: "QRIS",
    customer: "Michael Chen",
    amount: "Rp 28.000.000",
    status: "Processing",
    time: "10:34 AM",
  },
];
