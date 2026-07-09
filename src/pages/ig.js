// Clean Instagram landing link: syngyn.co/ig
//
// Server-redirects into the standard cohort path (?cohort=social — a whitelisted
// cohort token) so the full, already-tested homepage gate runs: unlocks the
// cohort catalog + lights up merchandising, exactly like any other cohort link.
// `social` is a cohort token (not a ?ref affiliate code), so IG traffic
// attributes as direct — no commission. The shareable link stays short + on
// brand; the grant happens on the hop.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/?cohort=social',
      permanent: false,
    },
  }
}

export default function InstagramRedirect() {
  return null
}
