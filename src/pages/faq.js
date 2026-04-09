import { useState } from 'react';
import SEO from '../components/SEO';

const faqs = [
  {
    category: 'Products',
    items: [
      { q: 'What are research peptides?', a: 'Research peptides are short chains of amino acids used in scientific research and laboratory studies. Our products are synthesized to 99%+ purity and are intended strictly for in-vitro research use.' },
      { q: 'What purity level are your peptides?', a: 'All of our peptides are synthesized to 99% purity or higher. Each batch is third-party tested and a Certificate of Analysis (COA) is available upon request.' },
      { q: 'What format do your products come in?', a: 'All products are supplied as lyophilized (freeze-dried) powder in sealed 2 mL glass vials with flip-top caps. Kits contain 10 vials.' },
      { q: 'How should I store the peptides?', a: 'Store lyophilized peptides at -20°C for long-term storage. Reconstituted peptides should be stored at 2–8°C and used within the timeframe specified on the product documentation.' },
      { q: 'Do you provide Certificates of Analysis (COAs)?', a: 'Yes. COAs are available for every batch. Contact us with your order number and we will provide the relevant COA.' },
    ],
  },
  {
    category: 'Ordering',
    items: [
      { q: 'How do I place an order?', a: 'Browse our shop, add products to your cart, and proceed to checkout. Fill in your shipping information and complete payment through our secure MoonPay payment system.' },
      { q: 'What payment methods do you accept?', a: 'We accept credit and debit card payments processed through MoonPay. Your payment is securely converted to USDC (a stablecoin) on the Polygon network. A ~4% processing fee applies.' },
      { q: 'Do you offer bulk discounts?', a: 'Yes! We offer 10-vial kits for every product at a significant discount (up to 30% off individual pricing). Volume discount tiers are also available — see the shop page for details.' },
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
      { q: 'What is your return policy?', a: 'Due to the nature of research compounds, all sales are final once shipped. We do offer replacements or refunds for damaged, defective, or incorrect items — contact us within 48 hours of delivery.' },
      { q: 'What if my order arrives damaged?', a: 'Contact us within 48 hours with photos of the damage. We will send a replacement or issue a full refund.' },
      { q: 'How do I contact support?', a: 'Email us at contact@optimizedperformanceinc.com with your order number and a description of your issue. We respond within 24 hours.' },
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
      className="card-premium p-5 mb-2 cursor-pointer transition-colors hover:border-brand-cyan/20"
      onClick={() => setOpen(!open)}
    >
      <div className="flex justify-between items-center gap-3">
        <span className="text-sm font-semibold text-brand-cream">{q}</span>
        <span className={`text-brand-cyan text-base shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </div>
      {open && (
        <div className="text-sm text-brand-muted leading-relaxed mt-3 pt-3 border-t border-white/[0.06]">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="min-h-[60vh]">
      <SEO
        title="FAQ"
        description="Frequently asked questions about Optimized Performance research peptides — products, ordering, shipping, returns, and legal information."
        path="/faq"
      />
      <div className="bg-brand-navy py-14 px-6 text-center">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-cyan uppercase mb-2">Support</p>
        <h1 className="text-3xl font-heading font-bold text-brand-cream mb-2">Frequently Asked Questions</h1>
        <p className="text-sm text-brand-muted">Everything you need to know about ordering research peptides</p>
      </div>

      <div className="max-w-narrow mx-auto px-6 py-12">
        {faqs.map((section) => (
          <div key={section.category} className="mb-8">
            <h2 className="text-base font-heading font-bold text-brand-cream mb-3 pb-2 border-b border-brand-cyan/20">
              {section.category}
            </h2>
            {section.items.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        ))}

        <div className="text-center card-premium p-8 mt-4">
          <h3 className="text-base font-heading font-bold text-brand-cream mb-2">Still have questions?</h3>
          <p className="text-sm text-brand-muted">
            Reach out to us at <strong className="text-brand-cream">contact@optimizedperformanceinc.com</strong> and we will get back to you within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
