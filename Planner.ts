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
    function planInterpretation(interpretation: Interpreter.DNFFormula, state: WorldState): string[] {
        //

        console.log(state);
        console.log(interpretation);


        var graph = new SGraph();
        var result: SearchResult<SNode> = undefined;
        var startNode = new SNode(state);

        var isGoal = function (node: SNode): boolean {
          for (var _interpretation of interpretation) {
            if(isInterpretationInCurrentWorldstate(_interpretation[0], state)) {
              return true;
            }
          }
          return false;
        };

        var heuristic = function (node: SNode): number {
          var minHeuristic = 9999999;
          for (var _interpretation of interpretation) {
            var heuristicValue = getHeuristicForGoal(_interpretation[0], state)
            // We want to choose the smallest heuristic.
            if (heuristicValue < minHeuristic) {
              minHeuristic = heuristicValue;
            }
          }
          return minHeuristic;
        }

        result = aStarSearch(graph, startNode, isGoal, heuristic, 10);

        //generate plan
        var plan: string[] = [];

        result.path.unshift(startNode);
        for (let i = 0; i < result.path.length; i++) {
            var edges = graph.outgoingEdges(result.path[i]);
            var pathNode = result.path[i + 1];
            for (let j = 0; j < edges.length; j++)
                if (graph.compareNodes(pathNode, edges[j].to) == 0) {
                    plan.push(edges[j].command);
                }
        }

        return plan;

    }

    class SGraph implements Graph<SNode>{

        outgoingEdges(node: SNode): EdgeWithCommand<SNode>[] {
            var edges: EdgeWithCommand<SNode>[] = [];


            //Move arm left?
            if (node.state.arm > 0) {
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
            if (node.state.arm < node.state.stacks.length ) {
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
            if (node.state.holding && node.state.stacks[node.state.arm][node.state.stacks[node.state.arm].length - 1] ?
                Interpreter.isMoveValid(node.state.holding, "ontop", node.state.stacks[node.state.arm][node.state.stacks[node.state.arm].length - 1], tmpState) : true) {

                var edge: EdgeWithCommand<SNode> = new EdgeWithCommand<SNode>();

                edge.from = node; //Adding startnode

                //Creating goal node
                var tmpState: WorldState = { stacks: [], holding: undefined, arm: undefined, objects: undefined, examples: undefined };
                for (var i = 0; i < node.state.stacks.length; i++) {
                    tmpState.stacks.push(node.state.stacks[i].slice());
                }
                tmpState.stacks[tmpState.arm].push(tmpState.holding); //Dropping object on stack where arm is
                tmpState.holding = null; //Arm isn't holding anything anymore
                tmpState.arm = node.state.arm;
                tmpState.objects = node.state.objects;
                tmpState.examples = node.state.examples;

                edge.to = new SNode(tmpState);
                edge.cost = 1;
                edge.command = "d";

                edges.push(edge);

            }

            //Can pick up?
            if (!node.state.holding && node.state.stacks[node.state.arm].length != 0) {
                var edge: EdgeWithCommand<SNode> = new EdgeWithCommand<SNode>();

                edge.from = node; //Adding startnode

                //Creating goal node
                var tmpState: WorldState = { stacks: [], holding: undefined, arm: undefined, objects: undefined, examples: undefined };
                for (var i = 0; i < node.state.stacks.length; i++) {
                    tmpState.stacks.push(node.state.stacks[i].slice());
                }
                tmpState.holding = tmpState.stacks[tmpState.arm].pop(); //Picking up top object from stack
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
        foundObjectRelation = Interpreter.doesObjectExist(state.stacks, _interpretation.args[0]);
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
            Math.abs(state.arm - Interpreter.getStackNumber(state.stacks, _interpretation.args[0]))
          }
        } else {
          if (
            _interpretation.relation == "inside" ||
            _interpretation.relation == "ontop" ||
            _interpretation.relation == "above" ||
            _interpretation.relation == "under"
          ) {
            return Math.abs(Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[1]));

          } else if (_interpretation.relation == "beside") {
            // If we don't are beside each we give the heuristic value 4
            if (Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) == Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) {
              return 1;
            } else {
              return Math.abs(Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) - 1;
            }

          } else if (_interpretation.relation == "leftof") {
            if (Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) > Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) {
              return Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[1]);
            } else {
              return 0;
            }

          } else if (_interpretation.relation == "rightof") {
            if (Interpreter.getStackNumber(state.stacks, _interpretation.args[0]) < Interpreter.getStackNumber(state.stacks, _interpretation.args[1])) {
              return Interpreter.getStackNumber(state.stacks, _interpretation.args[1]) - Interpreter.getStackNumber(state.stacks, _interpretation.args[0]);
            } else {
              return 0;
            }
          } else {
            console.log("WARNING: not implemented to heuristic for " +_interpretation.relation);
          }
        }
      }
      return 1;
    }

    class SNode {

        constructor(public state: WorldState) { }






    }

    class EdgeWithCommand<SNode> extends Edge<SNode> {
        command: string;
    }

}
