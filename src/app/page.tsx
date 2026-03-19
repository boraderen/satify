import Link from "next/link";
import { ReductionLandscape } from "@/components/ReductionLandscape";
import { SITE_ICON_PATH } from "@/lib/site";
import { supportedProblems } from "@/lib/problems";

export default function Home() {
  return (
    <main className="page-shell">
      <header className="page-intro">
        <div className="brand-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="home-brand-icon"
            src={SITE_ICON_PATH}
            alt="SATify icon"
            width={42}
            height={42}
          />
          <h1>SATify</h1>
        </div>
        <p>
          Build decision problem instances, reduce them to SAT and 3-SAT,
          compare solver runtimes, and inspect how each reduction is
          constructed across graph and logic problems.
        </p>
      </header>

      <section className="section-card section-card-plain">
        <div className="section-heading">
          <div>
            <h2>Available problems</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="problem-table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>NP-complete</th>
                <th>Strong NP-complete</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {supportedProblems.map((problem) => (
                <tr key={problem.slug}>
                  <td>
                    <strong>{problem.name}</strong>
                  </td>
                  <td>{problem.isNpComplete ? "Yes" : "No"}</td>
                  <td>{problem.isStronglyNpComplete ? "Yes" : "No"}</td>
                  <td>
                    {problem.href ? (
                      <Link className="inline-link" href={problem.href}>
                        Explore
                      </Link>
                    ) : (
                      <span className="muted-text">Soon</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-card section-card-plain">
        <div className="section-heading">
          <div>
            <h2>Problem landscape</h2>
          </div>
        </div>
        <ReductionLandscape />
      </section>
    </main>
  );
}
