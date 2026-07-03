import { registerRoute } from "DuetWebControl";

import ClosedLoopTuning from "./ClosedLoopTuning.vue";

registerRoute(ClosedLoopTuning, {
	Plugins: {
		ClosedLoopTuning: {
			icon: "mdi-chart-bell-curve-cumulative",
			caption: "Closed Loop",
			path: "/Plugins/ClosedLoopTuning"
		}
	}
});
