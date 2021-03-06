///<reference path="World.ts"/>
///<reference path="Interpreter.ts"/>
///<reference path="Graph.ts"/>

/**
* Planner module
*
* The goal of the Planner module is to take the interpetation(s)
* produced by the Interpreter module and to plan a sequence of actions
* for the robot to put the world into a state compatible with the
* user's command, i.e. to achieve what the user wanted.
*
* The planner should use your A* search implementation to find a plan.
*/
module Planner {

    //////////////////////////////////////////////////////////////////////
    // exported functions, classes and interfaces/types

    /**
     * Top-level driver for the Planner. Calls `planInterpretation` for each given interpretation generated by the Interpreter.
     * @param interpretations List of possible interpretations.
     * @param currentState The current state of the world.
     * @returns Augments Interpreter.InterpretationResult with a plan represented by a list of strings.
     */
    export function plan(interpretations : Interpreter.InterpretationResult[], currentState : WorldState) : PlannerResult[] {
        var errors : Error[] = [];
        var plans : PlannerResult[] = [];
        interpretations.forEach((interpretation) => {
            try {
                var result : PlannerResult = <PlannerResult>interpretation;
                result.plan = planInterpretation(result.interpretation, currentState);
                if (result.plan.length == 0) {
                    result.plan.push("That is already true!");
                }
                plans.push(result);
            } catch(err) {
                errors.push(err);
            }
        });
        if (plans.length) {
            return plans;
        } else {
            // only throw the first error found
            throw errors[0];
        }
    }

    export interface PlannerResult extends Interpreter.InterpretationResult {
        plan : string[];
    }

    export function stringify(result : PlannerResult) : string {
        return result.plan.join(", ");
    }

    //////////////////////////////////////////////////////////////////////
    // private functions

    /**
     * The core planner function. The code here is just a template;
     * you should rewrite this function entirely. In this template,
     * the code produces a dummy plan which is not connected to the
     * argument `interpretation`, but your version of the function
     * should be such that the resulting plan depends on
     * `interpretation`.
     *
     *
     * @param interpretation The logical interpretation of the user's desired goal. The plan needs to be such that by executing it, the world is put into a state that satisfies this goal.
     * @param state The current world state.
     * @returns Basically, a plan is a
     * stack of strings, which are either system utterances that
     * explain what the robot is doing (e.g. "Moving left") or actual
     * actions for the robot to perform, encoded as "l", "r", "p", or
     * "d". The code shows how to build a plan. Each step of the plan can
     * be added using the `push` method.
     */
    function planInterpretation(interpretation: Interpreter.DNFFormula, state: WorldState): string[]{
        console.log(state);
        console.log(interpretation);
        var start = new Date().getTime();


        var graph = new SGraph();
        var result: SearchResult<SNode> = undefined;
        var startNode = new SNode(state);

        var isGoal = function (node: SNode): boolean {
          //console.log("Searching for goal");
          for (var _interpretation of interpretation) {
            if(isInterpretationInCurrentWorldstate(_interpretation[0], node.state)) {
              console.log("Found goal", _interpretation[0]);
              return true;
            }
          }
          return false;
        };

        var heuristic = function (node: SNode): number {
          //console.log("Testing heuristic");
          var minHeuristic = 9999999;
          for (var _interpretation of interpretation) {
            var heuristicValue = getHeuristicForGoal(_interpretation[0], node.state)
            // We want to choose the smallest heuristic.
            if (heuristicValue < minHeuristic) {
              minHeuristic = heuristicValue;
            }
          }

          return minHeuristic;
        }

        result = aStarSearch(graph, startNode, isGoal, heuristic, 500);
        var end = new Date().getTime();
        var time = end - start;
        console.log('Execution time: ' + time);

        if (result == null) {
          console.log("Could not find solution");
          return null;
        }
        //generate plan
        var plan: string[] = [];

        //console.log("a" + result);
        result.path.unshift(startNode);
        //console.log("b");
        for (let i = 0; i < result.path.length-1; i++) {
            var edges = graph.outgoingEdges(result.path[i]);
            //console.log("c");
            var pathNode = result.path[i+1];
            //console.log("d");
            for (let j = 0; j < edges.length; j++)
                if (graph.compareNodes(pathNode, edges[j].to) == 0) {
                    plan.push(edges[j].command);
                }
        }

        return plan;

    }

    class SGraph implements Graph<SNode>{


        outgoingEdges(node: SNode): EdgeWithCommand<SNode>[]{
            //console.log("3");
            var edges: EdgeWithCommand<SNode>[] = [];

            var targetObject = node.state.stacks[node.state.arm][node.state.stacks[node.state.arm].length - 1];
            //Move arm left?
            if (node.state.arm > 0) {
                //console.log("4");
                var edge: EdgeWithCommand<SNode> = new EdgeWithCommand<SNode>();

                edge.from = node; //Adding startnode

                //Creating goal node
                var tmpState: WorldState = { stacks: [], holding: undefined, arm: undefined, objects: undefined, examples: undefined };
                for (var i = 0; i < node.state.stacks.length; i++) {
                    tmpState.stacks.push(node.state.stacks[i].slice());
                }
                tmpState.holding = node.state.holding;
                tmpState.arm = node.state.arm - 1; //Moving arm left
                tmpState.objects = node.state.objects;
                tmpState.examples = node.state.examples;

                edge.to = new SNode(tmpState);
                edge.cost = 1;
                edge.command = "l";

                edges.push(edge);
            }

            //Move arm right?
            if (node.state.arm < node.state.stacks.length-1) {
                //console.log("5");
                var edge: EdgeWithCommand<SNode> = new EdgeWithCommand<SNode>();

                edge.from = node; //Adding startnode

                //Creating goal node
                var tmpState: WorldState = { stacks: [], holding: undefined, arm: undefined, objects: undefined, examples: undefined };
                for (var i = 0; i < node.state.stacks.length; i++) {
                    tmpState.stacks.push(node.state.stacks[i].slice());
                }
                tmpState.holding = node.state.holding;
                tmpState.arm = node.state.arm + 1; //Moving arm right
                tmpState.objects = node.state.objects;
                tmpState.examples = node.state.examples;

                edge.to = new SNode(tmpState);
                edge.cost = 1;
                edge.command = "r";

                edges.push(edge);
            }

            //Can drop?
            if (node.state.holding && ( targetObject ?
                Interpreter.isMoveValid(node.state.holding, "ontop", targetObject, node.state)
                || Interpreter.isMoveValid(node.state.holding, "inside", targetObject, node.state)
                 : true) ) {
                //console.log("6");
                var edge: EdgeWithCommand<SNode> = new EdgeWithCommand<SNode>();

                edge.from = node; //Adding startnode

                //Creating goal node
                var tmpState: WorldState = { stacks: [], holding: undefined, arm: undefined, objects: undefined, examples: undefined };
                for (var i = 0; i < node.state.stacks.length; i++) {
                    tmpState.stacks.push(node.state.stacks[i].slice());
                }
                tmpState.arm = node.state.arm;
                tmpState.objects = node.state.objects;
                tmpState.examples = node.state.examples;
                //console.log("6e");
                //console.log("index" + node.state.arm + "  " + tmpState.stacks[node.state.arm]);
                tmpState.stacks[node.state.arm].push(node.state.holding); //Dropping object on stack where arm is
                //console.log("6f");
                tmpState.holding = null; //Arm isn't holding anything anymore

                edge.to = new SNode(tmpState);
                edge.cost = 1;
                edge.command = "d";

                edges.push(edge);
            }

            //Can pick up?
            if (!node.state.holding && node.state.stacks[node.state.arm].length != 0) {
                var edge: EdgeWithCommand<SNode> = new EdgeWithCommand<SNode>();
                //console.log("7");
                edge.from = node; //Adding startnode

                //Creating goal node
                var tmpState: WorldState = { stacks: [], holding: undefined, arm: undefined, objects: undefined, examples: undefined };
                for (var i = 0; i < node.state.stacks.length; i++) {
                    tmpState.stacks.push(node.state.stacks[i].slice());
                }
                tmpState.holding = tmpState.stacks[node.state.arm].pop(); //Picking up top object from stack
                tmpState.arm = node.state.arm;
                tmpState.objects = node.state.objects;
                tmpState.examples = node.state.examples;

                edge.to = new SNode(tmpState);
                edge.cost = 1;
                edge.command = "p";

                edges.push(edge);
            }

            return edges;
        }

        compareNodes(one: SNode, theOther: SNode): number {
            if (one.state.holding != theOther.state.holding) return 1;
            if (one.state.arm != theOther.state.arm) return 1;
            for (var i = 0; i < theOther.state.stacks.length; i++) {
                for (var j = 0; j < theOther.state.stacks[i].length; j++) {
                    if (!one.state.stacks[i][j] || one.state.stacks[i][j] != theOther.state.stacks[i][j]) return 1;
                }
            }

            return 0;
        }

    }

    function isInterpretationInCurrentWorldstate(_interpretation: any, state: WorldState) {
      var foundObjectRelation: Boolean = false;

      if (_interpretation.relation == "beside") {
        foundObjectRelation = Interpreter.isBeside(state.stacks, _interpretation.args[0], _interpretation.args[1]);
      } else if (_interpretation.relation == "leftof") {
        foundObjectRelation = Interpreter.isLeftOf(state.stacks, _interpretation.args[0], _interpretation.args[1]);
      } else if (_interpretation.relation == "rightof") {
        foundObjectRelation = Interpreter.isRightOf(state.stacks, _interpretation.args[0], _interpretation.args[1]);
      } else if (_interpretation.relation == "holding") {
        foundObjectRelation = state.holding == _interpretation.args[0];
      } else {
        for (var stack of state.stacks) {
          if (_interpretation.relation == "inside") {
            foundObjectRelation = Interpreter.isInside(stack, _interpretation.args[0], _interpretation.args[1], state);
          } else if (_interpretation.relation == "ontop") {
            foundObjectRelation = Interpreter.isOnTop(stack, _interpretation.args[0], _interpretation.args[1], state);
          } else if (_interpretation.relation == "above") {
            foundObjectRelation = Interpreter.isAbove(stack, _interpretation.args[0], _interpretation.args[1], state);
          } else if (_interpretation.relation == "under") {
            foundObjectRelation = Interpreter.isUnder(stack, _interpretation.args[0], _interpretation.args[1], state);
          } else {
            console.log("WARNING: not implemented to check goal for " +_interpretation.relation);
          }
          if (foundObjectRelation) {
            return true;
          }
        }
      }

      return foundObjectRelation;
    }

    function getHeuristicForGoal(_interpretation: any, state: WorldState) :number {

      if (_interpretation.relation == "holding") {
        return Math.abs(state.arm - Interpreter.getStackNumber(state.stacks, _interpretation.args[0]));

      } else {
        if (_interpretation.args[1] == "floor") {
          if (_interpretation.args[0] == state.holding) {
            return 1;
          } else {
            return Math.abs(state.arm - Interpreter.getStackNumber(state.stacks, _interpretation.args[0]))
          }
        } else {

          var minArm = Math.min(Math.abs(state.arm - Interpreter.getStackNumber(state.stacks, _interpretation.args[0])),
            Math.abs(state.arm - Interpreter.getStackNumber(state.stacks, _interpretation.args[1])));
          if (
            _interpretation.relation == "inside" ||
            _interpretation.relation == "ontop" ||
            _interpretation.relation == "above" ||
            _interpretation.relation == "under"
          ) {
            var minMove = Math.abs(Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[1]));
            var minAccessTargetObject = accessTargetObject(_interpretation.args[0], state);

          } else if (_interpretation.relation == "beside") {
            // If we don't are beside each we give the heuristic value 4
            if (Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) == Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) {
              var minMove = 1;
            } else {
              var minMove = Math.abs(Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) - 1;
            }

          } else if (_interpretation.relation == "leftof") {
            if (Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) > Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) {
              var minMove = Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[1]);
            } else {
              var minMove = 0;
            }

          } else if (_interpretation.relation == "rightof") {
            if (Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) < Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) {
              var minMove = Interpreter.getStackNumber(state.stacks, _interpretation.args[1]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[0]);
            } else {
              var minMove = 0;
            }
          } else {
            console.log("WARNING: not implemented to heuristic for " +_interpretation.relation);
          }
          return minMove + minArm + minAccessTargetObject;
        }
      }
      //return 1;
    }

    function accessTargetObject(targetObject: string, state: WorldState) {
      var foundTargetObject: Boolean = false;
      var nrAbove: number = 0;
      for(var stack_number in state.stacks) {
        for(var object of state.stacks[stack_number]) {
          if (foundTargetObject) {
            nrAbove++;
          }
          if (object == targetObject) {
            foundTargetObject = true;
            break;
          }
        }
        if (foundTargetObject) {
          // All above we need to pick up, move and return
          return nrAbove*3;
        }
      }
      // We did not find any object.
      return 0;
    }

    class SNode {

        constructor(public state: WorldState) { }
		toString(): string {
			return JSON.stringify(this);
		}

    }

    class EdgeWithCommand<SNode> extends Edge<SNode> {
        command: string;
    }

}
