"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorText, isAbort, type KnowledgeCard } from "./api";
import { Empty, ErrorNote, Loading, cx } from "./ui";

export function KnowledgeSection() {
  const [items, setItems] = useState<KnowledgeCard[] | null>(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const [category, setCategory] = useState("全部");
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .knowledge(controller.signal)
      .then((data) => setItems(Array.isArray(data.items) ? data.items : []))
      .catch((err: unknown) => {
        if (!isAbort(err)) setError(errorText(err));
      });
    return () => controller.abort();
  }, [round]);

  const categories = useMemo(() => ["全部", ...Array.from(new Set((items ?? []).map((item) => item.category).filter(Boolean)))], [items]);
  const visible = (items ?? []).filter((item) => category === "全部" || item.category === category);

  function toggle(id: string) {
    setOpen((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  return (
    <section className="card card-pad space-y-4" aria-labelledby="knowledge-title">
      <div>
        <p className="eyebrow">Knowledge</p>
        <h2 id="knowledge-title" className="sub-title">
          高中英语知识卡
        </h2>
        <p className="section-desc">语法、写作和易错点，一张卡讲清一个点。点开卡片看例句、易错提醒和小练习。</p>
      </div>
      {error ? (
        <ErrorNote
          message={`知识卡加载失败：${error}`}
          onRetry={() => {
            setError("");
            setRound((value) => value + 1);
          }}
        />
      ) : null}
      {!items && !error ? <Loading label="正在加载知识卡…" /> : null}
      {items && !items.length ? <Empty title="知识卡还在准备中" /> : null}
      {items && items.length ? (
        <>
          {categories.length > 2 ? (
            <div className="segmented" role="group" aria-label="知识卡分类">
              {categories.map((value) => (
                <button key={value} type="button" className={cx("seg", category === value && "is-active")} aria-pressed={category === value} onClick={() => setCategory(value)}>
                  {value}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="knowledge-list">
            {visible.map((item) => {
              const expanded = open.includes(item.id);
              const panelId = `knowledge-${item.id}`;
              return (
                <li key={item.id} className={cx("knowledge-card", expanded && "is-open")}>
                  <button type="button" className="knowledge-head" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(item.id)}>
                    <span className="min-w-0 flex-1">
                      {item.category ? <span className="tag">{item.category}</span> : null}
                      <span className="knowledge-title">{item.title}</span>
                    </span>
                    <ChevronDown aria-hidden className="knowledge-chevron size-5 shrink-0" />
                  </button>
                  {expanded ? (
                    <div id={panelId} className="knowledge-body">
                      {item.body ? <p className="knowledge-text">{item.body}</p> : null}
                      {item.examples?.length ? (
                        <div>
                          <p className="knowledge-label">例句</p>
                          <ul className="knowledge-examples">
                            {item.examples.map((example, i) => (
                              <li key={i}>{example}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {item.pitfall ? (
                        <p className="knowledge-pitfall">
                          <span className="knowledge-label">易错提醒</span>
                          {item.pitfall}
                        </p>
                      ) : null}
                      {item.practice ? (
                        <p className="knowledge-practice">
                          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
                          <span>
                            <span className="knowledge-label">试一试</span>
                            {item.practice}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}