"use client";

import { useState } from "react";

const initialPosts = [
  { title: "평일 오전 함께 치실 분", people: "2 / 4", status: "모집중" },
  { title: "주말 연습 조인", people: "4 / 4", status: "마감" }
];

export function JoinManagementDemo() {
  const [posts, setPosts] = useState(initialPosts);

  return (
    <div className="grid gap-3">
      {posts.map((post, index) => (
        <div
          key={post.title}
          className="flex flex-col gap-3 rounded-md border border-[#e5ece1] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-extrabold">{post.title}</p>
            <p className="mt-1 text-sm text-[#697468]">
              참가 {post.people} · {post.status}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPosts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, status: "마감" } : item)))}
            className="rounded-md bg-vista-leaf px-4 py-3 text-sm font-extrabold text-white"
          >
            마감 처리
          </button>
        </div>
      ))}
    </div>
  );
}
