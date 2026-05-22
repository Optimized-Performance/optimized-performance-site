import { useState } from 'react';
import SEO from '../components/SEO';
import { Icon } from '../components/Primitives';

const faqs = [
  {
    category: 'Products',
    items: [
      { q: 'What are research peptides?', a: 'Research peptides are short chains of amino acids used in scientific research and laboratory studies. Our products are synthesized to 99%+ purity and are intended strictly for in-vitro research use.' },
      { q: 'What purity level are your peptides?', a: 'Our average tested purity is 99%, and most COAs come in at 99.8% on the published Certificate of Analysis. One SKU (Ipamorelin) tested at 98% on its most recent batch — we list it at 98% rather than advertise a number we can\'t consistently match. Every lot has a publicly published COA at /coa/{sku}/{lot} on this site; we\'d rather under-promise and ship better than over-promise and ship inconsistent.' },
      { q: 'What format do your products come in?', a: 'All products are supplied as lyophilized (freeze-dried) powder in sealed 2 mL glass vials with flip-top caps. Kits contain 10 vials.' },
      { q: 'How should I store the peptides?', a: 'Store lyophilized peptides at -20°C for long-term storage. Reconstituted peptides should be stored at 2–8°C and used within the timeframe specified on the product documentation.' },
      { q: 'Do you provide Certificates of Analysis (COAs)?', a: 'Yes. Every batch has a publicly published COA on this site at /coa/{sku}/{lot} — the lot number is printed on every vial label and linked from each product page. All testing is independent third-party HPLC + mass spec verification.' },
    ],
  },
  {
    category: 'Ordering',
    items: [
      { q: 'How do I place an order?', a: 'Browse our shop, add products to your cart, and proceed to checkout. Fill in your shipping information and complete payment off-site through our secure payment processor.' },
      { q: 'What payment methods do you accept?', a: 'We accept credit and debit cards (processed by Bankful) and cryptocurrency (BTC, ETH, USDC, USDT — processed by NOWPayments). Both options are presented at checkout.' },
      { q: 'Do you offer bulk discounts?', a: 'Yes — every product has a 10-vial kit option at a significant discount (up to 30% off the individual-vial price). The kits are how we handle volume.' },
      { q: 'Do you have promo or affiliate codes?', a: 'Yes. If you have an affiliate or promo code, enter it at checkout to receive your discount. Contact us if you are interested in becoming an affiliate.' },
      { q: 'Is there a minimum order?', a: 'No minimum order. You can purchase a single vial or a 10-vial kit.' },
    ],
  },
  {
    category: 'Shipping',
    items: [
      { q: 'How fast do you ship?', a: 'Orders are processed and shipped within 1 business day. Standard delivery is 3–5 business days via USPS Priority Mail.' },
      { q: 'Do you ship internationally?', a: 'Currently we ship to US addresses only. International shipping may be available in the future.' },
      { q: 'Is the packaging discrete?', a: 'Yes. All orders ship in plain, unbranded packaging with no indication of contents on the exterior.' },
      { q: 'How do I track my order?', a: 'You will receive a shipping confirmation email with a USPS tracking number once your order ships.' },
    ],
  },
  {
    category: 'Returns & Support',
    items: [
      { q: 'What is your return policy?', a: 'Due to the nature of research compounds, all sales are final once shipped. We do offer replacements or refunds for damaged, defective, or incorrect items — contact us within 7 days of delivery.' },
      { q: 'What if my order arrives damaged?', a: 'Contact us within 7 days with photos of the damage. We will send a replacement or issue a full refund.' },
      { q: 'How do I contact support?', a: 'Three channels: (1) email admin@optimizedperformancepeptides.com, (2) call/text +1 (831) 218-5147, or (3) join our customer Telegram group for direct access to the team and other customers. Email and phone both respond within 24 hours; Telegram is typically real-time during business hours. Customers who place an order receive a Telegram invite link in their order confirmation.' },
    ],
  },
  {
    category: 'Legal',
    items: [
      { q: 'Are these products for human use?', a: 'No. All products are sold strictly for in-vitro research and laboratory use only. They are not intended for human consumption, veterinary use, or as drugs, foods, or cosmetics.' },
      { q: 'Do I need to be a certain age to purchase?', a: 'Yes. You must be 21 years of age or older to purchase from Optimized Performance.' },
      { q: 'Are peptides legal to purchase?', a: 'Research peptides are legal to purchase for in-vitro research purposes in the United States. They are not FDA-approved for human use.' },
    ],
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="card-premium p-5 mb-2 cursor-pointer transition-colors hover:border-ink"
      onClick={() => setOpen(!open)}
    >
      <div className="flex justify-between items-center gap-3">
        <span className="text-sm font-semibold text-ink">{q}</span>
        <span className={`text-ink-soft shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <Icon name="chevDown" size={16} />
        </span>
      </div>
      {open && (
        <div className="text-sm text-ink-soft leading-relaxed mt-3 pt-3 border-t border-line">{a}</div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="FAQ"
        description="Frequently asked questions about Optimized Performance research peptides — products, ordering, shipping, returns, and legal information."
        path="/faq"
      />
      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Support</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Frequently asked questions
        </h1>
        <p className="text-ink-soft text-sm m-0">Everything you need to know about ordering research peptides.</p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        {faqs.map((section) => (
          <div key={section.category} className="mb-10">
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-4 pb-2 border-b border-line">
              {section.category}
            </h2>
            {section.items.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        ))}

        <div className="card-premium p-8 mt-4 text-center">
          <h3 className="font-display font-semibold text-lg mb-2 text-ink">Still have questions?</h3>
          <p className="text-sm text-ink-soft leading-relaxed m-0">
            Reach out at{' '}
            <a href="mailto:admin@optimizedperformancepeptides.com" className="text-accent-strong hover:underline font-semibold">
              admin@optimizedperformancepeptides.com
            </a>
            {' '}or{' '}
            <a href="tel:+18312185147" className="text-accent-strong hover:underline font-semibold font-mono">
              +1 (831) 218-5147
            </a>
            {' '}and we will get back to you within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
