'use client';

import { useEffect, useState } from 'react';
import { Do_Hyeon } from 'next/font/google';
import { supabase, type Post } from '@/lib/supabase';

const doHyeon = Do_Hyeon({ subsets: ['latin'], weight: '400' });

const LIKED_IDS_STORAGE_KEY = 'guestbook-liked-ids';
const ADMIN_PASSCODE_STORAGE_KEY = 'guestbook-admin-passcode';
const PAGE_SIZE = 5;

function formatDate(iso: string) {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month}월 ${day}일 ${hh}:${mm}`;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2}>
      <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.6 4.7 13.5 3.8 15.5 4c3.6.5 5.1 4.4 3.6 7.9-2.5 4.5-10 9.1-10 9.1z" />
    </svg>
  );
}

export default function HomePage() {
  const [entries, setEntries] = useState<Post[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(new Set());
  const [adminPasscode, setAdminPasscode] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function loadEntries() {
      const { data, error: fetchError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        setLoadError('방명록을 불러오는 중 오류가 발생했습니다.');
        console.error(fetchError);
      } else {
        setEntries(data ?? []);
      }
      setIsLoading(false);
    }

    loadEntries();

    try {
      const storedLikes = window.localStorage.getItem(LIKED_IDS_STORAGE_KEY);
      if (storedLikes) setLikedIds(new Set(JSON.parse(storedLikes)));

      const storedPasscode = window.sessionStorage.getItem(ADMIN_PASSCODE_STORAGE_KEY);
      if (storedPasscode) setAdminPasscode(storedPasscode);
    } catch (storageError) {
      console.error(storageError);
    }
  }, []);

  const totalPages = Math.max(Math.ceil(entries.length / PAGE_SIZE), 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const persistLikedIds = (ids: Set<string>) => {
    window.localStorage.setItem(LIKED_IDS_STORAGE_KEY, JSON.stringify([...ids]));
  };

  const adjustLikeCount = (id: string, delta: number) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, likes_count: Math.max(entry.likes_count + delta, 0) } : entry
      )
    );
  };

  const handleToggleLike = async (id: string) => {
    if (pendingLikeIds.has(id)) return;

    const alreadyLiked = likedIds.has(id);
    const delta = alreadyLiked ? -1 : 1;

    setPendingLikeIds((current) => new Set(current).add(id));
    adjustLikeCount(id, delta);
    setLikedIds((current) => {
      const next = new Set(current);
      if (alreadyLiked) next.delete(id);
      else next.add(id);
      persistLikedIds(next);
      return next;
    });

    const { error: rpcError } = await supabase.rpc(
      alreadyLiked ? 'decrement_post_like' : 'increment_post_like',
      { p_id: id }
    );

    if (rpcError) {
      console.error(rpcError);
      adjustLikeCount(id, -delta);
      setLikedIds((current) => {
        const next = new Set(current);
        if (alreadyLiked) next.add(id);
        else next.delete(id);
        persistLikedIds(next);
        return next;
      });
    }

    setPendingLikeIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleAdminToggle = async () => {
    if (adminPasscode) {
      setAdminPasscode(null);
      window.sessionStorage.removeItem(ADMIN_PASSCODE_STORAGE_KEY);
      return;
    }

    const input = window.prompt('관리자 비밀번호를 입력하세요');
    if (input === null) return;

    const { data, error: verifyError } = await supabase.rpc('verify_admin_passcode', {
      p_passcode: input,
    });

    if (verifyError || !data) {
      window.alert('비밀번호가 올바르지 않습니다.');
      return;
    }

    setAdminPasscode(input);
    window.sessionStorage.setItem(ADMIN_PASSCODE_STORAGE_KEY, input);
  };

  const handleDeletePost = async (id: string) => {
    if (!adminPasscode) return;
    if (!window.confirm('이 글을 삭제하시겠어요?')) return;

    const { data, error: deleteError } = await supabase.rpc('delete_post_as_admin', {
      p_id: id,
      p_passcode: adminPasscode,
    });

    if (deleteError || !data) {
      console.error(deleteError);
      window.alert('삭제에 실패했습니다. 관리자 비밀번호를 다시 확인해주세요.');
      return;
    }

    setEntries((current) => current.filter((entry) => entry.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedMessage) {
      setError('이름과 메시지를 모두 입력해주세요.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const { data, error: insertError } = await supabase
      .from('posts')
      .insert([{ name: trimmedName, message: trimmedMessage }])
      .select()
      .single();

    setIsSubmitting(false);

    if (insertError) {
      setError('메시지 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
      console.error(insertError);
      return;
    }

    if (data) {
      setEntries((current) => [data, ...current]);
      setName('');
      setMessage('');
      setPage(1);
    }
  };

  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="guestbook">
      <header className="profile-card">
        <div className="profile-avatar" aria-hidden="true">
          📮
        </div>
        <div className="profile-info">
          <h1 className={doHyeon.className}>나의 방명록</h1>
          <p>10초 안에 흔적을 남겨주세요</p>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-value">{entries.length}</span>
          <span className="profile-stat-label">방명록</span>
        </div>
      </header>

      <form className="write-form" onSubmit={handleSubmit} noValidate>
        <input
          className="field-input"
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />
        <textarea
          className="field-input field-textarea"
          placeholder="메시지를 남겨주세요"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="submit-button" disabled={isSubmitting}>
          {isSubmitting ? '등록 중...' : '남기기'}
        </button>
      </form>

      <div className="admin-toggle-row">
        <button type="button" className="admin-toggle" onClick={handleAdminToggle}>
          {adminPasscode ? '관리자 모드 종료' : '관리자 모드'}
        </button>
      </div>

      <section className="card-list">
        {loadError ? (
          <p className="load-error">{loadError}</p>
        ) : isLoading ? (
          <p className="empty-state">불러오는 중...</p>
        ) : entries.length === 0 ? (
          <p className="empty-state">첫 번째 방명록을 남겨주세요!</p>
        ) : (
          pagedEntries.map((entry) => {
            const liked = likedIds.has(entry.id);
            return (
              <article key={entry.id} className="guest-card">
                <div className="guest-card-top">
                  <span className="guest-name">{entry.name}</span>
                  <div className="guest-card-top-right">
                    <time className="guest-date">{formatDate(entry.created_at)}</time>
                    {adminPasscode ? (
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDeletePost(entry.id)}
                        aria-label="글 삭제"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="guest-message">{entry.message}</p>
                <div className="guest-card-footer">
                  <button
                    type="button"
                    className={`like-button${liked ? ' liked' : ''}`}
                    onClick={() => handleToggleLike(entry.id)}
                    aria-pressed={liked}
                    aria-label={liked ? '좋아요 취소' : '좋아요'}
                  >
                    <HeartIcon filled={liked} />
                    <span>{entry.likes_count}</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="페이지 이동">
          <button
            type="button"
            className="page-button"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`page-button${p === page ? ' active' : ''}`}
              onClick={() => setPage(p)}
              aria-current={p === page}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className="page-button"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            aria-label="다음 페이지"
          >
            ›
          </button>
        </nav>
      ) : null}
    </main>
  );
}
