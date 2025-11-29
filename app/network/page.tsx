"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import BubbleChart from "@/components/network/BubbleChart";
import NodeDetails from "@/components/network/NodeDetails";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw } from "lucide-react";

export default function NetworkPage() {
  const [data, setData] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/graph/summary${force ? "?force=true" : ""}`);
      if (!res.ok) {
        throw new Error("Failed to load network data");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleNodeClick = async (node: any) => {
    // Optimistically set selected node
    setSelectedNode(node);

    // Fetch detailed subgraph if needed
    try {
        const endpoint = node.type === 'company' 
            ? `/api/company/${node.id}`
            : `/api/freelancer/${node.id}`;
            
        const res = await fetch(endpoint);
        if(res.ok) {
            const detailData = await res.json();
            // Merge detail data if necessary, or just update the view
            // For now, we just stick with the summary data + local selection
            // but in a real app we might update the graph data here
        }
    } catch (e) {
        console.error("Failed to fetch node details", e);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <Sidebar />
      <div className="flex-1 relative overflow-hidden flex flex-col ml-64">
        {/* Header */}
        <header className="absolute top-0 left-0 w-full z-30 p-6 flex justify-between items-start pointer-events-none">
            <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
                Saksham Network
            </h1>
            <p className="text-slate-400 text-sm mt-1">
                Visualize connections between Freelancers and Companies
            </p>
            </div>
            <div className="pointer-events-auto">
                <button 
                    onClick={() => fetchData(true)}
                    className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors text-slate-400 hover:text-white"
                    title="Refresh Data"
                >
                    <RefreshCw size={20} />
                </button>
            </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 relative">
            {loading && !data && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-950">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
                    <p className="text-slate-400 animate-pulse">Loading Network Graph...</p>
                </div>
            </div>
            )}

            {error && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-950">
                <div className="text-center max-w-md p-6 bg-red-950/30 border border-red-900/50 rounded-xl">
                <h3 className="text-xl font-bold text-red-400 mb-2">Connection Error</h3>
                <p className="text-slate-300 mb-4">{error}</p>
                <button 
                    onClick={() => fetchData()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                    Retry Connection
                </button>
                </div>
            </div>
            )}

            {!loading && !error && data && (
            <BubbleChart 
                data={data} 
                onNodeClick={handleNodeClick} 
                width={window.innerWidth} 
                height={window.innerHeight} 
            />
            )}
        </main>

        {/* Sidebar / Details */}
        <AnimatePresence>
            {selectedNode && (
            <NodeDetails 
                node={selectedNode} 
                onClose={() => setSelectedNode(null)} 
            />
            )}
        </AnimatePresence>
      </div>
    </div>
  );
}
